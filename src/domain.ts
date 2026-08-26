import { z } from 'zod'

export const jsonRecordSchema = z.record(z.string(), z.unknown())

export const merchantSchema = z
  .object({
    id: z.union([z.string(), z.number()]),
    name: z.string().optional(),
  })
  .catchall(z.unknown())

export const orderSchema = z
  .object({
    id: z.string(),
    orderState: z.string().optional(),
    paymentState: z.string().optional(),
    tableId: z.number().optional(),
    createdAt: z.string(),
    updatedAt: z.string().optional(),
    openedAt: z.string().optional(),
  })
  .catchall(z.unknown())

export const syncPayloadSchema = z.object({
  merchant: merchantSchema,
  device: jsonRecordSchema.optional().default({}),
  categories: z.array(jsonRecordSchema).optional().default([]),
  catalog: z.array(jsonRecordSchema).optional().default([]),
  options: z.array(jsonRecordSchema).optional().default([]),
  halls: z.array(jsonRecordSchema).optional().default([]),
  tables: z.array(jsonRecordSchema).optional().default([]),
  orders: z.array(orderSchema).optional().default([]),
  orderEvents: z
    .array(z.object({ event: z.string(), order: orderSchema }))
    .optional()
    .default([]),
  pluginVersion: z.string().optional(),
  syncedAt: z.string().optional(),
  syncKind: z.enum(['snapshot', 'incremental', 'backfill']).optional().default('snapshot'),
})

export const pairPayloadSchema = z.object({
  code: z.string().trim().min(6).max(32),
  merchant: merchantSchema,
  device: jsonRecordSchema,
  pluginVersion: z.string().optional(),
})

export type JsonRecord = z.infer<typeof jsonRecordSchema>
export type TossMerchant = z.infer<typeof merchantSchema>
export type TossOrder = z.infer<typeof orderSchema>
export type SyncPayload = z.infer<typeof syncPayloadSchema>

export interface MerchantSnapshot {
  merchantId: string
  merchant: JsonRecord
  device: JsonRecord
  categories: JsonRecord[]
  catalog: JsonRecord[]
  options: JsonRecord[]
  halls: JsonRecord[]
  tables: JsonRecord[]
  updatedAt: string
}

export interface ConnectionStatus {
  connectionId: string
  merchantId: string
  merchantName: string
  device: JsonRecord
  pluginVersion: string | null
  pairedAt: string
  lastSeenAt: string | null
  dataFreshnessSeconds: number | null
}

export interface OrderQuery {
  merchantId?: string
  start?: string
  end?: string
  orderStates?: string[]
  paymentStates?: string[]
  tableId?: number
  limit?: number
  offset?: number
}

export interface PendingCommand {
  id: string
  connectionId: string
  type: 'orders.sync' | 'snapshot.sync'
  payload: JsonRecord
  createdAt: string
}

export interface DataSource {
  getConnections(): Promise<ConnectionStatus[]>
  getSnapshot(merchantId?: string): Promise<MerchantSnapshot | null>
  listOrders(query: OrderQuery): Promise<TossOrder[]>
  getOrder(orderId: string, merchantId?: string): Promise<TossOrder | null>
  queueSync(args: {
    merchantId?: string
    start?: string
    end?: string
  }): Promise<{ commandId: string; status: string }>
}

export const POS_CAPABILITIES = {
  readable: [
    'merchant',
    'device',
    'categories',
    'catalog',
    'catalog availability',
    'POS-tracked stock quantities',
    'menu options',
    'halls',
    'tables and open checks',
    'orders',
    'discounts',
    'embedded payments',
    'tax and tip totals',
  ],
  sync: ['initial order backfill', 'incremental order events', 'manual date-range refresh'],
  intentionallyNotExposed: [
    'order creation, cancellation, or completion',
    'payment creation or cancellation',
    'cash receipt creation',
    'draft-order mutation',
  ],
  notes: [
    'Inventory quantities exist only when a catalog price is configured as stockable in Toss Place.',
    'The bridge is analytics-first and read-only by default. Operational mutations require a future explicit opt-in design.',
    'Toss Payments is a separate future provider and is not part of the Toss Place v1 connection.',
  ],
} as const
