import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createBridge } from '../src/bridge.js'
import { signPluginRequest } from '../src/security.js'
import { Store } from '../src/storage.js'
import { completedOrder, snapshot } from './fixtures.js'

const cleanups: Array<() => Promise<void>> = []
afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()))
})

describe('bridge authentication', () => {
  it('pairs once, accepts a signed sync, and rejects a replayed nonce', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'toss-mcp-bridge-'))
    const store = await Store.open(`sqlite:${join(directory, 'test.sqlite')}`)
    const token = 'test-access-token-that-is-long-enough'
    const app = await createBridge(
      {
        host: '127.0.0.1',
        port: 8787,
        publicUrl: 'https://bridge.example.test',
        databaseUrl: `sqlite:${join(directory, 'test.sqlite')}`,
        accessToken: token,
        bridgeUrl: 'http://127.0.0.1:8787',
      },
      store,
    )
    cleanups.push(async () => {
      await app.close()
      await store.close()
    })

    const codeResponse = await app.inject({
      method: 'POST',
      url: '/v1/admin/pairing-codes',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      payload: { ttlMinutes: 15 },
    })
    expect(codeResponse.statusCode).toBe(200)
    const { code } = codeResponse.json<{ code: string }>()

    const pairPayload = {
      code,
      merchant: snapshot.merchant,
      device: snapshot.device,
      pluginVersion: '0.1.0',
    }
    const pairResponse = await app.inject({
      method: 'POST',
      url: '/v1/plugin/pair',
      headers: { 'content-type': 'application/octet-stream' },
      payload: JSON.stringify(pairPayload),
    })
    expect(pairResponse.statusCode).toBe(200)
    const connection = pairResponse.json<{ connectionId: string; secret: string }>()

    const payload = JSON.stringify({
      merchant: snapshot.merchant,
      device: snapshot.device,
      categories: snapshot.categories,
      catalog: snapshot.catalog,
      options: [],
      halls: snapshot.halls,
      tables: snapshot.tables,
      orders: [completedOrder],
      syncKind: 'snapshot',
      syncedAt: snapshot.updatedAt,
    })
    const timestamp = String(Date.now())
    const nonce = 'unique-nonce-for-replay-test'
    const headers = {
      'content-type': 'application/json',
      'x-toss-mcp-connection-id': connection.connectionId,
      'x-toss-mcp-timestamp': timestamp,
      'x-toss-mcp-nonce': nonce,
      'x-toss-mcp-signature': signPluginRequest(connection.secret, timestamp, nonce, payload),
    }
    const first = await app.inject({ method: 'POST', url: '/v1/plugin/sync', headers, payload })
    const replay = await app.inject({ method: 'POST', url: '/v1/plugin/sync', headers, payload })
    expect(first.statusCode).toBe(200)
    expect(replay.statusCode).toBe(401)
  })
})
