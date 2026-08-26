import { createHash, createHmac, timingSafeEqual } from 'node:crypto'

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

export function secureEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

export function signPluginRequest(
  secret: string,
  timestamp: string,
  nonce: string,
  body: string,
): string {
  return createHmac('sha256', secret).update(`${timestamp}.${nonce}.${body}`).digest('hex')
}

export function verifyPluginSignature(args: {
  secret: string
  timestamp: string
  nonce: string
  body: string
  signature: string
  now?: number
  maxAgeMs?: number
}): boolean {
  const timestamp = Number(args.timestamp)
  const now = args.now ?? Date.now()
  const maxAgeMs = args.maxAgeMs ?? 5 * 60 * 1000
  if (!Number.isFinite(timestamp) || Math.abs(now - timestamp) > maxAgeMs) return false
  return secureEqual(
    signPluginRequest(args.secret, args.timestamp, args.nonce, args.body),
    args.signature,
  )
}
