import type {
  ConnectionStatus,
  DataSource,
  MerchantSnapshot,
  OrderQuery,
  TossOrder,
} from './domain.js'
import type { Store } from './storage.js'

export class StoreDataSource implements DataSource {
  constructor(private readonly store: Store) {}

  getConnections(): Promise<ConnectionStatus[]> {
    return this.store.getConnections()
  }

  getSnapshot(merchantId?: string): Promise<MerchantSnapshot | null> {
    return this.store.getSnapshot(merchantId)
  }

  listOrders(query: OrderQuery): Promise<TossOrder[]> {
    return this.store.listOrders(query)
  }

  getOrder(orderId: string, merchantId?: string): Promise<TossOrder | null> {
    return this.store.getOrder(orderId, merchantId)
  }

  queueSync(args: {
    merchantId?: string
    start?: string
    end?: string
  }): Promise<{ commandId: string; status: string }> {
    return this.store.queueSync(args)
  }
}

export class BridgeClient implements DataSource {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
  ) {}

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(new URL(path, this.baseUrl), {
      ...init,
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
        ...init?.headers,
      },
    })
    if (!response.ok)
      throw new Error(`Bridge returned ${response.status}: ${await response.text()}`)
    return (await response.json()) as T
  }

  getConnections(): Promise<ConnectionStatus[]> {
    return this.request('/v1/data/connections')
  }

  getSnapshot(merchantId?: string): Promise<MerchantSnapshot | null> {
    const query = merchantId ? `?merchantId=${encodeURIComponent(merchantId)}` : ''
    return this.request(`/v1/data/snapshot${query}`)
  }

  listOrders(query: OrderQuery): Promise<TossOrder[]> {
    const params = new URLSearchParams()
    if (query.merchantId) params.set('merchantId', query.merchantId)
    if (query.start) params.set('start', query.start)
    if (query.end) params.set('end', query.end)
    if (query.tableId !== undefined) params.set('tableId', String(query.tableId))
    if (query.limit !== undefined) params.set('limit', String(query.limit))
    if (query.offset !== undefined) params.set('offset', String(query.offset))
    for (const state of query.orderStates ?? []) params.append('orderState', state)
    for (const state of query.paymentStates ?? []) params.append('paymentState', state)
    return this.request(`/v1/data/orders?${params}`)
  }

  getOrder(orderId: string, merchantId?: string): Promise<TossOrder | null> {
    const query = merchantId ? `?merchantId=${encodeURIComponent(merchantId)}` : ''
    return this.request(`/v1/data/orders/${encodeURIComponent(orderId)}${query}`)
  }

  queueSync(args: {
    merchantId?: string
    start?: string
    end?: string
  }): Promise<{ commandId: string; status: string }> {
    return this.request('/v1/data/sync', { method: 'POST', body: JSON.stringify(args) })
  }
}
