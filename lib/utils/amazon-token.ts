import crypto from 'crypto'

const TOKEN_TTL_MS = 60 * 60 * 1000

function base64UrlEncode(input: string | Buffer): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}

function base64UrlDecode(input: string): string {
  const padded = input + '='.repeat((4 - (input.length % 4)) % 4)
  const normalized = padded.replace(/-/g, '+').replace(/_/g, '/')
  return Buffer.from(normalized, 'base64').toString('utf8')
}

function signPayload(payload: string, secret: string): string {
  const signature = crypto.createHmac('sha256', secret).update(payload).digest()
  return base64UrlEncode(signature)
}

export function createAmazonImportToken(userId: string, secret: string): { token: string; expiresAt: string } {
  const expiresAt = Date.now() + TOKEN_TTL_MS
  const payload = base64UrlEncode(JSON.stringify({ uid: userId, exp: expiresAt }))
  const signature = signPayload(payload, secret)
  return {
    token: `${payload}.${signature}`,
    expiresAt: new Date(expiresAt).toISOString(),
  }
}

export function verifyAmazonImportToken(token: string, secret: string): { userId: string } | null {
  const [payload, signature] = token.split('.')
  if (!payload || !signature) return null

  const expected = signPayload(payload, secret)
  const expectedBuf = Buffer.from(expected)
  const actualBuf = Buffer.from(signature)
  if (expectedBuf.length !== actualBuf.length) return null
  if (!crypto.timingSafeEqual(expectedBuf, actualBuf)) return null

  try {
    const decoded = JSON.parse(base64UrlDecode(payload)) as { uid?: string; exp?: number }
    if (!decoded?.uid || !decoded?.exp) return null
    if (Date.now() > decoded.exp) return null
    return { userId: decoded.uid }
  } catch {
    return null
  }
}
