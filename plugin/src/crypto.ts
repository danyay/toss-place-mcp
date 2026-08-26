const encoder = new TextEncoder()

function hex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function sign(
  secret: string,
  timestamp: string,
  nonce: string,
  body: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  return hex(await crypto.subtle.sign('HMAC', key, encoder.encode(`${timestamp}.${nonce}.${body}`)))
}

export async function digest(value: string): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', encoder.encode(value)))
}

export function nonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(18))
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}
