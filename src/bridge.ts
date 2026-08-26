import { randomBytes } from 'node:crypto'
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify'
import rateLimit from '@fastify/rate-limit'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { pairPayloadSchema, syncPayloadSchema, type OrderQuery } from './domain.js'
import type { AppConfig } from './config.js'
import { generateSecret } from './config.js'
import { StoreDataSource } from './data-source.js'
import { createMcpServer } from './mcp.js'
import { secureEqual, verifyPluginSignature } from './security.js'
import type { Store } from './storage.js'

declare module 'fastify' {
  interface FastifyRequest {
    rawBody?: string
  }
}

function bearer(request: FastifyRequest): string {
  const header = request.headers.authorization ?? ''
  return header.startsWith('Bearer ') ? header.slice(7) : ''
}

function asStrings(value: unknown): string[] | undefined {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value) && value.every((item) => typeof item === 'string')) return value
  return undefined
}

function pairingCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = randomBytes(8)
  return [...bytes].map((byte) => alphabet[byte % alphabet.length]).join('')
}

async function authenticatePlugin(request: FastifyRequest, store: Store): Promise<string> {
  const connectionId = String(request.headers['x-toss-mcp-connection-id'] ?? '')
  const timestamp = String(request.headers['x-toss-mcp-timestamp'] ?? '')
  const nonce = String(request.headers['x-toss-mcp-nonce'] ?? '')
  const signature = String(request.headers['x-toss-mcp-signature'] ?? '')
  if (!connectionId || !timestamp || nonce.length < 12 || !signature)
    throw new Error('Missing plugin authentication')
  const secret = await store.getConnectionSecret(connectionId)
  if (!secret) throw new Error('Unknown plugin connection')
  const valid = verifyPluginSignature({
    secret,
    timestamp,
    nonce,
    body: request.rawBody ?? '',
    signature,
  })
  if (!valid) throw new Error('Invalid or expired plugin signature')
  const unused = await store.useNonce(connectionId, nonce, Number(timestamp) + 5 * 60 * 1000)
  if (!unused) throw new Error('Plugin request was already used')
  return connectionId
}

export async function createBridge(config: AppConfig, store: Store): Promise<FastifyInstance> {
  const app = Fastify({ logger: true, bodyLimit: 5 * 1024 * 1024 })

  const parseJsonBody: Parameters<typeof app.addContentTypeParser>[2] = (request, body, done) => {
    const text = String(body)
    request.rawBody = text
    try {
      done(null, text.length ? JSON.parse(text) : {})
    } catch (error) {
      done(error as Error, undefined)
    }
  }
  app.addContentTypeParser('application/json', { parseAs: 'string' }, parseJsonBody)
  // Toss Place POS's plugin HTTP client currently sends JSON without a
  // Content-Type header. Fastify treats that body as application/octet-stream,
  // so retain the exact raw body and parse it as JSON for plugin compatibility.
  app.addContentTypeParser('*', { parseAs: 'string' }, parseJsonBody)
  await app.register(rateLimit, { max: 240, timeWindow: '1 minute' })

  app.get('/health', async () => ({ ok: true, service: 'toss-place-mcp-bridge', version: '0.1.0' }))

  app.addHook('preHandler', async (request, reply) => {
    const protectedPath =
      request.url.startsWith('/v1/data/') ||
      request.url.startsWith('/v1/admin/') ||
      request.url.startsWith('/mcp')
    if (protectedPath && !secureEqual(bearer(request), config.accessToken)) {
      return reply.code(401).send({ error: 'Unauthorized' })
    }
  })

  app.post('/v1/admin/pairing-codes', async (request) => {
    const input = (request.body ?? {}) as { ttlMinutes?: number }
    const ttlMinutes = Math.min(Math.max(Number(input.ttlMinutes ?? 15), 1), 60)
    const code = pairingCode()
    const expiresAt = Date.now() + ttlMinutes * 60 * 1000
    await store.createPairingCode(code, expiresAt)
    return { code, expiresAt: new Date(expiresAt).toISOString(), bridgeUrl: config.publicUrl }
  })

  app.post(
    '/v1/plugin/pair',
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const input = pairPayloadSchema.parse(request.body)
      const secret = generateSecret()
      const connectionId = await store.consumePairingCode({
        code: input.code,
        merchantId: String(input.merchant.id),
        merchantName: String(input.merchant.name ?? input.merchant.id),
        secret,
        device: input.device,
        ...(input.pluginVersion ? { pluginVersion: input.pluginVersion } : {}),
      })
      if (!connectionId)
        return reply.code(401).send({ error: 'Pairing code is invalid, expired, or already used' })
      return { connectionId, secret, merchantId: String(input.merchant.id) }
    },
  )

  app.post('/v1/plugin/sync', async (request, reply) => {
    try {
      const connectionId = await authenticatePlugin(request, store)
      const payload = syncPayloadSchema.parse(request.body)
      await store.ingest(connectionId, payload)
      return { ok: true, receivedAt: new Date().toISOString() }
    } catch (error) {
      request.log.warn(error)
      return reply
        .code(401)
        .send({ error: error instanceof Error ? error.message : 'Invalid plugin request' })
    }
  })

  app.get('/v1/plugin/commands', async (request, reply) => {
    try {
      const connectionId = await authenticatePlugin(request, store)
      return { commands: await store.pendingCommands(connectionId) }
    } catch (error) {
      return reply
        .code(401)
        .send({ error: error instanceof Error ? error.message : 'Invalid plugin request' })
    }
  })

  app.post('/v1/plugin/commands/:id/result', async (request, reply) => {
    try {
      const connectionId = await authenticatePlugin(request, store)
      const id = String((request.params as { id: string }).id)
      const input = (request.body ?? {}) as { ok?: boolean; result?: unknown; error?: unknown }
      await store.completeCommand(
        connectionId,
        id,
        input.ok === true,
        input.ok ? input.result : input.error,
      )
      return { ok: true }
    } catch (error) {
      return reply
        .code(401)
        .send({ error: error instanceof Error ? error.message : 'Invalid plugin request' })
    }
  })

  app.get('/v1/data/connections', async () => store.getConnections())

  app.get('/v1/data/snapshot', async (request) => {
    const query = request.query as { merchantId?: string }
    return store.getSnapshot(query.merchantId)
  })

  app.get('/v1/data/orders', async (request) => {
    const query = request.query as Record<string, unknown>
    const orderQuery: OrderQuery = {
      ...(typeof query.merchantId === 'string' ? { merchantId: query.merchantId } : {}),
      ...(typeof query.start === 'string' ? { start: query.start } : {}),
      ...(typeof query.end === 'string' ? { end: query.end } : {}),
      ...(query.tableId !== undefined ? { tableId: Number(query.tableId) } : {}),
      ...(query.limit !== undefined ? { limit: Number(query.limit) } : {}),
      ...(query.offset !== undefined ? { offset: Number(query.offset) } : {}),
      ...(asStrings(query.orderState) ? { orderStates: asStrings(query.orderState) } : {}),
      ...(asStrings(query.paymentState) ? { paymentStates: asStrings(query.paymentState) } : {}),
    }
    return store.listOrders(orderQuery)
  })

  app.get('/v1/data/orders/:id', async (request) => {
    const { id } = request.params as { id: string }
    const query = request.query as { merchantId?: string }
    return store.getOrder(id, query.merchantId)
  })

  app.post('/v1/data/sync', async (request) => {
    const input = (request.body ?? {}) as { merchantId?: string; start?: string; end?: string }
    return store.queueSync(input)
  })

  app.post('/mcp', async (request, reply) => {
    const server = createMcpServer(new StoreDataSource(store))
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
    await server.connect(transport)
    reply.hijack()
    await transport.handleRequest(request.raw, reply.raw, request.body)
    reply.raw.on('close', () => {
      void transport.close()
      void server.close()
    })
  })

  app.route({
    method: ['GET', 'DELETE'],
    url: '/mcp',
    handler: async (_request, reply) =>
      reply
        .code(405)
        .send({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed' }, id: null }),
  })

  return app
}
