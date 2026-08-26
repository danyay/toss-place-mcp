import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { describe, expect, it } from 'vitest'
import type { DataSource } from '../src/domain.js'
import { createMcpServer } from '../src/mcp.js'
import { completedOrder, openOrder, snapshot } from './fixtures.js'

const source: DataSource = {
  async getConnections() {
    return [
      {
        connectionId: 'connection-1',
        merchantId: snapshot.merchantId,
        merchantName: 'Sample Bar',
        device: snapshot.device,
        pluginVersion: '0.1.0',
        pairedAt: snapshot.updatedAt,
        lastSeenAt: snapshot.updatedAt,
        dataFreshnessSeconds: 5,
      },
    ]
  },
  async getSnapshot() {
    return { ...snapshot, tables: [{ id: 1, title: 'Table 1', order: openOrder }] }
  },
  async listOrders() {
    return [completedOrder]
  },
  async getOrder(id: string) {
    return id === completedOrder.id ? completedOrder : null
  },
  async queueSync() {
    return { commandId: 'command-1', status: 'pending' }
  },
}

describe('MCP server', () => {
  it('advertises raw and opinionated tools and executes analytics', async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    const server = createMcpServer(source)
    const client = new Client({ name: 'test-client', version: '1.0.0' })
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])
    const tools = await client.listTools()
    expect(tools.tools.map((tool) => tool.name)).toEqual(
      expect.arrayContaining([
        'get_pos_data',
        'inventory',
        'list_orders',
        'sales_summary',
        'top_items',
      ]),
    )
    const response = await client.callTool({
      name: 'sales_summary',
      arguments: { start: '2026-08-24T15:00:00Z', end: '2026-08-25T14:59:59Z' },
    })
    const text = (response.content as Array<{ type: string; text: string }>)[0]?.text ?? '{}'
    expect(JSON.parse(text)).toMatchObject({ bookedSales: 20000, openCheckValue: 9000 })

    const inventoryResponse = await client.callTool({
      name: 'inventory',
      arguments: { limit: 1, offset: 0 },
    })
    const inventoryText =
      (inventoryResponse.content as Array<{ type: string; text: string }>)[0]?.text ?? '{}'
    expect(JSON.parse(inventoryText)).toMatchObject({ count: 1, offset: 0 })
    await client.close()
    await server.close()
  })
})
