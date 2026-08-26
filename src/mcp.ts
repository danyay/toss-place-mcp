import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import {
  comparePeriods,
  inventoryView,
  paymentBreakdown,
  salesSummary,
  salesTimeseries,
  topItems,
} from './analytics.js'
import {
  POS_CAPABILITIES,
  type DataSource,
  type JsonRecord,
  type OrderQuery,
  type TossOrder,
} from './domain.js'

const readOnly = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
}

function result(value: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] }
}

function todayInSeoul(): { start: string; end: string } {
  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
  return {
    start: new Date(`${date}T00:00:00+09:00`).toISOString(),
    end: new Date(`${date}T23:59:59.999+09:00`).toISOString(),
  }
}

function range(start?: string, end?: string): { start: string; end: string } {
  const defaults = todayInSeoul()
  return {
    start: start ? new Date(start).toISOString() : defaults.start,
    end: end ? new Date(end).toISOString() : defaults.end,
  }
}

const optionalMerchant = z
  .string()
  .optional()
  .describe('Toss merchant ID. Omit when only one merchant is paired.')
const dateRangeShape = {
  start: z
    .string()
    .datetime({ offset: true })
    .optional()
    .describe('Inclusive ISO 8601 start; defaults to today in Korea.'),
  end: z
    .string()
    .datetime({ offset: true })
    .optional()
    .describe('Inclusive ISO 8601 end; defaults to today in Korea.'),
}

async function ordersFor(
  source: DataSource,
  input: { merchantId?: string; start?: string; end?: string; limit?: number },
) {
  const selectedRange = range(input.start, input.end)
  return {
    range: selectedRange,
    orders: await source.listOrders({
      merchantId: input.merchantId,
      ...selectedRange,
      limit: input.limit ?? 5000,
    }),
  }
}

function includes(haystack: unknown, needle: string): boolean {
  return JSON.stringify(haystack).toLocaleLowerCase().includes(needle.toLocaleLowerCase())
}

function currentOpenTableOrders(tables: JsonRecord[]): TossOrder[] {
  const orders: TossOrder[] = []
  for (const table of tables) {
    const value = table.order
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue
    const order = value as JsonRecord
    if (typeof order.id !== 'string' || typeof order.createdAt !== 'string') continue
    if (order.orderState === 'COMPLETED' || order.orderState === 'CANCELLED') continue
    orders.push(order as TossOrder)
  }
  return orders
}

function mergeOrders(primary: TossOrder[], additional: TossOrder[]): TossOrder[] {
  const orders = new Map(primary.map((order) => [order.id, order]))
  for (const order of additional) orders.set(order.id, order)
  return [...orders.values()]
}

export function createMcpServer(source: DataSource): McpServer {
  const server = new McpServer(
    {
      name: 'toss-place-mcp',
      version: '0.1.0',
      websiteUrl: 'https://github.com/danyay/toss-place-mcp',
    },
    {
      instructions:
        'Read-only Toss Place POS analytics. Before interpreting sales, call connection_status and mention stale/offline data. Default date ranges use Asia/Seoul. Never count open checks as booked sales. Stock quantities exist only for products configured as stockable in Toss. Use refresh_pos_data when the requested range may not be cached, then re-query after the POS plugin processes it. Toss Payments is not included in v1.',
    },
  )

  server.registerTool(
    'connection_status',
    {
      title: 'Toss POS connection status',
      description:
        'Check paired merchants, POS devices, plugin versions, and data freshness before analysis.',
      inputSchema: {},
      annotations: readOnly,
    },
    async () => result({ connections: await source.getConnections() }),
  )

  server.registerTool(
    'get_pos_data',
    {
      title: 'Get raw Toss POS data',
      description:
        'Read a raw merchant, device, category, catalog, option, hall, or table snapshot.',
      inputSchema: {
        domain: z.enum([
          'merchant',
          'device',
          'categories',
          'catalog',
          'options',
          'halls',
          'tables',
        ]),
        merchantId: optionalMerchant,
        search: z.string().optional().describe('Case-insensitive text filter for list domains.'),
      },
      annotations: readOnly,
    },
    async ({ domain, merchantId, search }) => {
      const snapshot = await source.getSnapshot(merchantId)
      if (!snapshot) throw new Error('No Toss POS snapshot has been received')
      let value: JsonRecord | JsonRecord[] = snapshot[domain]
      if (search && Array.isArray(value)) value = value.filter((entry) => includes(entry, search))
      return result({
        merchantId: snapshot.merchantId,
        syncedAt: snapshot.updatedAt,
        domain,
        data: value,
      })
    },
  )

  server.registerTool(
    'inventory',
    {
      title: 'Toss POS inventory',
      description:
        'List catalog availability and real remaining quantities when Toss stock tracking is enabled.',
      inputSchema: {
        merchantId: optionalMerchant,
        search: z.string().optional(),
        state: z.enum(['ON_SALE', 'SOLD_OUT', 'UNAVAILABLE', 'DELETED']).optional(),
        stockTrackedOnly: z.boolean().optional().default(false),
        atOrBelow: z
          .number()
          .nonnegative()
          .optional()
          .describe('Only stock-tracked items at or below this quantity.'),
        limit: z.number().int().min(1).max(1000).optional().default(100),
        offset: z.number().int().nonnegative().optional().default(0),
      },
      annotations: readOnly,
    },
    async ({ merchantId, search, state, stockTrackedOnly, atOrBelow, limit, offset }) => {
      const snapshot = await source.getSnapshot(merchantId)
      if (!snapshot) throw new Error('No Toss POS snapshot has been received')
      let items = inventoryView(snapshot.catalog)
      if (search) items = items.filter((item) => includes(item, search))
      if (state) items = items.filter((item) => item.state === state)
      if (stockTrackedOnly) items = items.filter((item) => item.isStockable)
      if (atOrBelow !== undefined) {
        items = items.filter(
          (item) => item.remainingQuantity !== null && item.remainingQuantity <= atOrBelow,
        )
      }
      const totalMatches = items.length
      items = items.slice(offset, offset + limit)
      return result({
        merchantId: snapshot.merchantId,
        syncedAt: snapshot.updatedAt,
        inventorySemantics:
          'remainingQuantity is present only when Toss price.isStockable is true.',
        totalMatches,
        count: items.length,
        offset,
        items,
      })
    },
  )

  server.registerTool(
    'list_orders',
    {
      title: 'List Toss POS orders',
      description:
        'Read raw orders and their line items, discounts, payment states, and embedded payments.',
      inputSchema: {
        merchantId: optionalMerchant,
        ...dateRangeShape,
        orderStates: z.array(z.enum(['REQUESTED', 'OPENED', 'COMPLETED', 'CANCELLED'])).optional(),
        paymentStates: z
          .array(z.enum(['OPENED', 'PAID', 'CANCELLED', 'COMPLETED', 'REFUNDED']))
          .optional(),
        tableId: z.number().int().optional(),
        limit: z.number().int().min(1).max(1000).optional().default(100),
        offset: z.number().int().nonnegative().optional().default(0),
      },
      annotations: readOnly,
    },
    async ({ merchantId, start, end, orderStates, paymentStates, tableId, limit, offset }) => {
      const selectedRange = range(start, end)
      const query: OrderQuery = {
        merchantId,
        ...selectedRange,
        orderStates,
        paymentStates,
        tableId,
        limit,
        offset,
      }
      const orders = await source.listOrders(query)
      return result({ range: selectedRange, count: orders.length, orders })
    },
  )

  server.registerTool(
    'get_order',
    {
      title: 'Get a Toss POS order',
      description: 'Read one complete raw Toss order by ID.',
      inputSchema: { orderId: z.string().min(1), merchantId: optionalMerchant },
      annotations: readOnly,
    },
    async ({ orderId, merchantId }) => result(await source.getOrder(orderId, merchantId)),
  )

  server.registerTool(
    'sales_summary',
    {
      title: 'Toss sales summary',
      description:
        'Summarize booked sales, completed orders, average order value, discounts, and open checks.',
      inputSchema: { merchantId: optionalMerchant, ...dateRangeShape },
      annotations: readOnly,
    },
    async (input) => {
      const selected = await ordersFor(source, input)
      const snapshot = await source.getSnapshot(input.merchantId)
      const currentOpen = currentOpenTableOrders(snapshot?.tables ?? [])
      const summary = salesSummary(mergeOrders(selected.orders, currentOpen))
      summary.methodology.openCheckValue =
        'Current open table checks are displayed separately regardless of when the tab was opened, and are never counted as booked sales.'
      return result({
        range: selected.range,
        ...summary,
      })
    },
  )

  server.registerTool(
    'top_items',
    {
      title: 'Top-selling Toss items',
      description: 'Rank POS menu items by recorded line sales and quantity for a date range.',
      inputSchema: {
        merchantId: optionalMerchant,
        ...dateRangeShape,
        limit: z.number().int().min(1).max(100).optional().default(20),
      },
      annotations: readOnly,
    },
    async ({ limit, ...input }) => {
      const selected = await ordersFor(source, input)
      return result({ range: selected.range, items: topItems(selected.orders, limit) })
    },
  )

  server.registerTool(
    'sales_timeseries',
    {
      title: 'Toss sales by time',
      description: 'Break down sales by hour of day, calendar day, or weekday.',
      inputSchema: {
        merchantId: optionalMerchant,
        ...dateRangeShape,
        interval: z.enum(['hour', 'day', 'weekday']).default('day'),
      },
      annotations: readOnly,
    },
    async ({ interval, ...input }) => {
      const selected = await ordersFor(source, input)
      return result({
        range: selected.range,
        interval,
        buckets: salesTimeseries(selected.orders, interval),
      })
    },
  )

  server.registerTool(
    'payment_breakdown',
    {
      title: 'Toss payment breakdown',
      description:
        'Summarize embedded Toss payment records by card, cash, external, barcode, or transfer.',
      inputSchema: { merchantId: optionalMerchant, ...dateRangeShape },
      annotations: readOnly,
    },
    async (input) => {
      const selected = await ordersFor(source, input)
      return result({ range: selected.range, payments: paymentBreakdown(selected.orders) })
    },
  )

  server.registerTool(
    'compare_sales_periods',
    {
      title: 'Compare Toss sales periods',
      description:
        'Compare booked sales, order count, and average order value across two explicit ranges.',
      inputSchema: {
        merchantId: optionalMerchant,
        currentStart: z.string().datetime({ offset: true }),
        currentEnd: z.string().datetime({ offset: true }),
        previousStart: z.string().datetime({ offset: true }),
        previousEnd: z.string().datetime({ offset: true }),
      },
      annotations: readOnly,
    },
    async ({ merchantId, currentStart, currentEnd, previousStart, previousEnd }) => {
      const [current, previous] = await Promise.all([
        source.listOrders({ merchantId, start: currentStart, end: currentEnd, limit: 5000 }),
        source.listOrders({ merchantId, start: previousStart, end: previousEnd, limit: 5000 }),
      ])
      return result({
        ranges: {
          current: { start: currentStart, end: currentEnd },
          previous: { start: previousStart, end: previousEnd },
        },
        ...comparePeriods(current, previous),
      })
    },
  )

  server.registerTool(
    'refresh_pos_data',
    {
      title: 'Request Toss POS data refresh',
      description:
        'Queue a read-only snapshot or date-range order refresh for the paired POS plugin.',
      inputSchema: { merchantId: optionalMerchant, ...dateRangeShape },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ merchantId, start, end }) =>
      result({
        ...(await source.queueSync({ merchantId, start, end })),
        note: 'The command is asynchronous. Recheck connection_status and query the data again after the POS is online.',
      }),
  )

  server.registerResource(
    'toss-pos-capabilities',
    'toss-place://capabilities',
    {
      mimeType: 'application/json',
      description: 'Supported Toss Place POS domains and safety boundaries.',
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(POS_CAPABILITIES, null, 2),
        },
      ],
    }),
  )

  server.registerResource(
    'toss-pos-data-dictionary',
    'toss-place://data-dictionary',
    {
      mimeType: 'application/json',
      description: 'Metric definitions used by Toss Place MCP analytics.',
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(
            {
              bookedSales: 'Completed non-cancelled orders; sum of chargePrice.chargePriceValue.',
              openCheckValue:
                'Non-cancelled orders that are not completed. Never included in bookedSales.',
              inventory: 'Catalog price.stockQuantity only when price.isStockable is true.',
              timezone: 'Asia/Seoul for default day boundaries.',
              source: 'Data synchronized from @tossplace/pos-plugin-sdk inside the merchant POS.',
            },
            null,
            2,
          ),
        },
      ],
    }),
  )

  server.registerPrompt(
    'daily-sales-review',
    {
      title: 'Daily sales review',
      description: 'A safe workflow for reviewing today or another day of Toss sales.',
      argsSchema: {
        date: z.string().optional().describe('YYYY-MM-DD in Asia/Seoul; defaults to today.'),
      },
    },
    async ({ date }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Review ${date ?? 'today'} in Toss Place. Check connection freshness first, then use sales_summary, top_items, sales_timeseries by hour, and payment_breakdown. Separate booked sales from open checks, flag data gaps, and give five concise operational insights.`,
          },
        },
      ],
    }),
  )

  return server
}
