import { createHash, timingSafeEqual } from 'crypto'
import { decodeProtectedHeader, importJWK, jwtVerify } from 'jose'
import { plaidClient } from './client'

type PlaidWebhookClaims = {
  iat?: number
  request_body_sha256?: string
}

type JwkPublicKey = {
  alg: string
  crv: string
  kid: string
  kty: string
  use: string
  x: string
  y: string
  created_at: number
  expired_at?: number | null
}

const keyCache = new Map<string, JwkPublicKey>()
const MAX_AGE_SECONDS = 5 * 60

function isHashMatch(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  return timingSafeEqual(Buffer.from(a), Buffer.from(b))
}

async function getWebhookKey(kid: string): Promise<JwkPublicKey> {
  const cached = keyCache.get(kid)
  if (cached) {
    return cached
  }

  const response = await plaidClient.webhookVerificationKeyGet({ key_id: kid })
  const key = response.data.key as JwkPublicKey
  keyCache.set(kid, key)
  return key
}

export async function verifyPlaidWebhook({
  rawBody,
  signedJwt,
}: {
  rawBody: string
  signedJwt: string
}): Promise<void> {
  const header = decodeProtectedHeader(signedJwt)
  const keyId = header.kid
  const alg = header.alg ?? 'ES256'

  if (!keyId) {
    throw new Error('Missing Plaid webhook key id.')
  }

  const key = await getWebhookKey(keyId)
  const keyLike = await importJWK(key, alg)
  const { payload } = await jwtVerify<PlaidWebhookClaims>(signedJwt, keyLike, { algorithms: [alg] })

  if (typeof payload.iat === 'number') {
    const now = Math.floor(Date.now() / 1000)
    if (Math.abs(now - payload.iat) > MAX_AGE_SECONDS) {
      throw new Error('Plaid webhook is outside the allowed time window.')
    }
  }

  const claimedHash = payload.request_body_sha256
  if (!claimedHash) {
    throw new Error('Missing request_body_sha256 in Plaid webhook payload.')
  }

  const bodyHash = createHash('sha256').update(rawBody).digest('hex')
  if (!isHashMatch(bodyHash, claimedHash)) {
    throw new Error('Plaid webhook body hash mismatch.')
  }
}
