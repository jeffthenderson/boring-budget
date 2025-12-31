export const AUTH_COOKIE_NAME = 'bb_auth'

export async function hashPasscode(passcode: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(passcode)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hashBuffer))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')
}

export async function getExpectedPasscodeHash(): Promise<string | null> {
  const passcode = process.env.BB_PASSCODE
  if (!passcode) return null
  return hashPasscode(passcode)
}
