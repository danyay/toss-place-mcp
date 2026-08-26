import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Store } from '../src/storage.js'
import { completedOrder, snapshot } from './fixtures.js'

const stores: Store[] = []
afterEach(async () => {
  await Promise.all(stores.splice(0).map((store) => store.close()))
})

describe('Store', () => {
  it('pairs once, ingests a snapshot, and queries orders', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'toss-mcp-'))
    const store = await Store.open(`sqlite:${join(directory, 'test.sqlite')}`)
    stores.push(store)
    await store.createPairingCode('ABCDEF12', Date.now() + 60_000)
    const connectionId = await store.consumePairingCode({
      code: 'ABCDEF12',
      merchantId: snapshot.merchantId,
      merchantName: 'Sample Bar',
      secret: 'sample-secret',
      device: snapshot.device,
    })
    expect(connectionId).toBeTruthy()
    expect(
      await store.consumePairingCode({
        code: 'ABCDEF12',
        merchantId: snapshot.merchantId,
        merchantName: 'Sample Bar',
        secret: 'other',
        device: snapshot.device,
      }),
    ).toBeNull()

    await store.ingest(connectionId!, {
      merchant: snapshot.merchant as any,
      device: snapshot.device,
      categories: snapshot.categories,
      catalog: snapshot.catalog,
      options: [],
      halls: snapshot.halls,
      tables: snapshot.tables,
      orders: [completedOrder],
      orderEvents: [],
      syncKind: 'snapshot',
      syncedAt: snapshot.updatedAt,
    })

    expect((await store.getSnapshot(snapshot.merchantId))?.catalog).toHaveLength(1)
    expect(await store.getOrder(completedOrder.id, snapshot.merchantId)).toMatchObject({
      id: completedOrder.id,
    })
    expect(await store.listOrders({ merchantId: snapshot.merchantId })).toHaveLength(1)
  })
})
