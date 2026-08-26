import { posPluginSdk } from '@tossplace/pos-plugin-sdk'
import { digest, nonce, sign } from './crypto'

const PLUGIN_VERSION = '0.1.5'
const BRIDGE_URL_KEY = 'toss_mcp_bridge_url'
const PAIRING_CODE_KEY = 'toss_mcp_pairing_code'
const CONNECTION_KEY = 'toss_mcp_connection_v1'
const INITIAL_SYNC_KEY = 'toss_mcp_initial_sync_v1'

interface Connection {
  bridgeUrl: string
  connectionId: string
  secret: string
  merchantId: string
  pairingCodeHash: string
}

interface Command {
  id: string
  type: 'orders.sync' | 'snapshot.sync'
  payload: { start?: string; end?: string }
}

function normalizeBridgeUrl(value: string): string {
  const url = new URL(value.trim())
  if (!['http:', 'https:'].includes(url.protocol))
    throw new Error('Bridge URL must use HTTP or HTTPS')
  return url.toString().replace(/\/$/, '')
}

async function settings() {
  await posPluginSdk.setting.setInputs([
    {
      id: BRIDGE_URL_KEY,
      label: 'Toss MCP bridge URL',
      type: 'text',
      required: true,
      placeholder: 'https://toss-mcp.example.com',
      default: '',
    },
    {
      id: PAIRING_CODE_KEY,
      label: 'One-time pairing code',
      type: 'password',
      required: true,
      placeholder: 'Enter the code from toss-place-mcp pairing-code',
      default: '',
    },
  ])
  const values = await posPluginSdk.setting.getValues<Record<string, string | undefined>>()
  const bridgeUrl = String(values[BRIDGE_URL_KEY] ?? '').trim()
  return {
    bridgeUrl: bridgeUrl ? normalizeBridgeUrl(bridgeUrl) : '',
    pairingCode: String(values[PAIRING_CODE_KEY] ?? '')
      .trim()
      .toUpperCase(),
  }
}

async function pair(): Promise<Connection> {
  const currentSettings = await settings()
  if (!currentSettings.bridgeUrl)
    throw new Error('Enter the Toss MCP bridge URL in the plugin settings')
  const stored = await posPluginSdk.secureStore.get(CONNECTION_KEY)
  if (stored) {
    const connection = JSON.parse(stored) as Connection
    const unchangedCode =
      !currentSettings.pairingCode ||
      connection.pairingCodeHash === (await digest(currentSettings.pairingCode))
    if (connection.bridgeUrl === currentSettings.bridgeUrl && unchangedCode) return connection
  }
  if (!currentSettings.pairingCode)
    throw new Error('Enter a one-time pairing code in the plugin settings')

  const [merchant, device, plugin] = await Promise.all([
    posPluginSdk.merchant.getMerchant(),
    posPluginSdk.device.getDeviceInfo(),
    posPluginSdk.plugin.getPluginInfo(),
  ])
  const response = await posPluginSdk.http.post(`${currentSettings.bridgeUrl}/v1/plugin/pair`, {
    code: currentSettings.pairingCode,
    merchant,
    device,
    pluginVersion: plugin.version || PLUGIN_VERSION,
  })
  if (response.code < 200 || response.code >= 300)
    throw new Error(`Bridge pairing returned ${response.code}: ${response.body}`)
  const paired = JSON.parse(response.body || '{}') as Pick<
    Connection,
    'connectionId' | 'secret' | 'merchantId'
  >
  const connection = {
    ...paired,
    bridgeUrl: currentSettings.bridgeUrl,
    pairingCodeHash: await digest(currentSettings.pairingCode),
  }
  await posPluginSdk.secureStore.set(CONNECTION_KEY, JSON.stringify(connection))
  posPluginSdk.toast.success({ message: 'Toss MCP bridge connected' })
  return connection
}

async function request(path: string, method: 'GET' | 'POST', payload?: unknown) {
  const connection = await pair()
  const body = payload === undefined ? '' : JSON.stringify(payload)
  const timestamp = String(Date.now())
  const requestNonce = nonce()
  const headers: [string, string][] = [
    ['Content-Type', 'application/json'],
    ['x-toss-mcp-connection-id', connection.connectionId],
    ['x-toss-mcp-timestamp', timestamp],
    ['x-toss-mcp-nonce', requestNonce],
    ['x-toss-mcp-signature', await sign(connection.secret, timestamp, requestNonce, body)],
  ]
  const response =
    method === 'GET'
      ? await posPluginSdk.http.get(`${connection.bridgeUrl}${path}`, headers, { timeoutMs: 15000 })
      : await posPluginSdk.http.post(`${connection.bridgeUrl}${path}`, payload ?? {}, headers, {
          timeoutMs: 30000,
        })
  if (response.code < 200 || response.code >= 300)
    throw new Error(`Bridge returned ${response.code}: ${response.body}`)
  return JSON.parse(response.body || '{}') as any
}

function dateRange(days: number): { start: string; end: string } {
  const end = new Date(Date.now() + 24 * 60 * 60 * 1000)
  const start = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  return { start: start.toISOString(), end: end.toISOString() }
}

async function getAllOrders(start: string, end: string, maxPages = 100) {
  const orders: any[] = []
  const ids = new Set<string>()
  for (let page = 1; page <= maxPages; page += 1) {
    const batch = await posPluginSdk.order.getOrders({ start, end, page, size: 100 })
    for (const order of batch) {
      if (!ids.has(order.id)) {
        ids.add(order.id)
        orders.push(order)
      }
    }
    if (batch.length < 100) break
  }
  return orders
}

async function sendSnapshot(initial: boolean) {
  const now = new Date()
  const period = dateRange(initial ? 90 : 2)
  const [merchant, device, categories, catalog, options, halls, tables, orders] = await Promise.all(
    [
      posPluginSdk.merchant.getMerchant(),
      posPluginSdk.device.getDeviceInfo(),
      posPluginSdk.category.getCategories(),
      posPluginSdk.catalog.getCatalogs(),
      posPluginSdk.option.getOptions(),
      posPluginSdk.table.getHalls(),
      posPluginSdk.table.getTables(),
      getAllOrders(period.start, period.end),
    ],
  )
  await request('/v1/plugin/sync', 'POST', {
    merchant,
    device,
    categories,
    catalog,
    options,
    halls,
    tables,
    orders,
    pluginVersion: PLUGIN_VERSION,
    syncedAt: now.toISOString(),
    syncKind: 'snapshot',
  })
  if (initial) await posPluginSdk.storage.set(INITIAL_SYNC_KEY, 'true')
}

async function reportOrder(orderId: string, event: string) {
  const [merchant, device, order] = await Promise.all([
    posPluginSdk.merchant.getMerchant(),
    posPluginSdk.device.getDeviceInfo(),
    posPluginSdk.order.getOrder(orderId),
  ])
  await request('/v1/plugin/sync', 'POST', {
    merchant,
    device,
    orderEvents: [{ event, order }],
    pluginVersion: PLUGIN_VERSION,
    syncedAt: new Date().toISOString(),
    syncKind: 'incremental',
  })
}

async function runCommand(command: Command) {
  if (command.type === 'snapshot.sync') {
    await sendSnapshot(false)
    return { synced: 'snapshot' }
  }
  if (command.type === 'orders.sync') {
    const fallback = dateRange(90)
    const start = command.payload.start ?? fallback.start
    const end = command.payload.end ?? fallback.end
    const [merchant, device, orders] = await Promise.all([
      posPluginSdk.merchant.getMerchant(),
      posPluginSdk.device.getDeviceInfo(),
      getAllOrders(start, end),
    ])
    await request('/v1/plugin/sync', 'POST', {
      merchant,
      device,
      orders,
      pluginVersion: PLUGIN_VERSION,
      syncedAt: new Date().toISOString(),
      syncKind: 'backfill',
    })
    return { synced: 'orders', start, end, count: orders.length }
  }
  throw new Error(`Unsupported command ${(command as Command).type}`)
}

async function pollCommands() {
  const response = (await request('/v1/plugin/commands', 'GET')) as { commands?: Command[] }
  for (const command of response.commands ?? []) {
    try {
      const result = await runCommand(command)
      await request(`/v1/plugin/commands/${command.id}/result`, 'POST', { ok: true, result })
    } catch (error) {
      await request(`/v1/plugin/commands/${command.id}/result`, 'POST', {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
}

let snapshotTimer: ReturnType<typeof setTimeout> | undefined
function scheduleSnapshot() {
  if (snapshotTimer) clearTimeout(snapshotTimer)
  snapshotTimer = setTimeout(() => void sendSnapshot(false).catch(console.error), 1500)
}

let runtimeStarted = false
let connecting = false

function startRuntime() {
  if (runtimeStarted) return
  runtimeStarted = true
  for (const event of ['add', 'update', 'delete'] as const)
    posPluginSdk.catalog.on(event, scheduleSnapshot)
  for (const event of ['add', 'update', 'delete'] as const)
    posPluginSdk.category.on(event, scheduleSnapshot)
  for (const event of ['add', 'update', 'delete'] as const)
    posPluginSdk.option.on(event, scheduleSnapshot)
  for (const event of ['add', 'update', 'delete', 'clear', 'move', 'merge'] as const) {
    posPluginSdk.table.on(event as any, scheduleSnapshot)
  }
  for (const event of [
    'add',
    'update',
    'accept',
    'decline',
    'expire',
    'complete',
    'cancel',
  ] as const) {
    posPluginSdk.order.on(
      event as any,
      (id: string) => void reportOrder(id, event).catch(console.error),
    )
  }
  for (const event of ['paid', 'cancel'] as const) {
    posPluginSdk.payment.on(
      event,
      (_paymentId, orderId) => void reportOrder(orderId, `payment.${event}`).catch(console.error),
    )
  }
  setInterval(() => void pollCommands().catch(console.error), 5000)
  setInterval(() => void sendSnapshot(false).catch(console.error), 5 * 60 * 1000)
}

async function connectAndStart() {
  if (connecting) return
  connecting = true
  try {
    await pair()
    startRuntime()
    const initial = (await posPluginSdk.storage.get(INITIAL_SYNC_KEY)) !== 'true'
    await sendSnapshot(initial)
    await pollCommands()
  } finally {
    connecting = false
  }
}

async function main() {
  const currentSettings = await settings()
  posPluginSdk.setting.on('change', () => void connectAndStart().catch(console.error))
  // Keep the plugin worker active on first install while the merchant opens
  // settings and enters the bridge URL and one-time pairing code.
  setInterval(() => {
    if (!runtimeStarted) void connectAndStart().catch(() => undefined)
  }, 5000)
  if (currentSettings.bridgeUrl && currentSettings.pairingCode) await connectAndStart()
}

main().catch((error) => {
  console.error(error)
  posPluginSdk.toast.error({
    message: error instanceof Error ? error.message : 'Toss MCP plugin failed to start',
  })
})
