import { describe, expect, it } from 'vitest'
import { signPluginRequest, verifyPluginSignature } from '../src/security.js'

describe('plugin request signatures', () => {
  it('accepts an exact, fresh signed body', () => {
    const timestamp = String(Date.now())
    const body = JSON.stringify({ sample: true })
    const signature = signPluginRequest('secret', timestamp, 'long-random-nonce', body)
    expect(
      verifyPluginSignature({
        secret: 'secret',
        timestamp,
        nonce: 'long-random-nonce',
        body,
        signature,
      }),
    ).toBe(true)
  })

  it('rejects body changes and stale timestamps', () => {
    const timestamp = String(Date.now() - 10 * 60 * 1000)
    const signature = signPluginRequest('secret', timestamp, 'long-random-nonce', '{}')
    expect(
      verifyPluginSignature({
        secret: 'secret',
        timestamp,
        nonce: 'long-random-nonce',
        body: '{"changed":true}',
        signature,
      }),
    ).toBe(false)
  })
})
