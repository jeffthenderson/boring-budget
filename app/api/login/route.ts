import { NextResponse } from 'next/server'
import { AUTH_COOKIE_NAME, hashPasscode } from '@/lib/auth'

export async function POST(request: Request) {
  const { passcode } = await request.json()
  const expected = process.env.BB_PASSCODE

  if (!expected) {
    return NextResponse.json(
      { error: 'Passcode authentication is not configured.' },
      { status: 400 }
    )
  }

  if (!passcode || passcode !== expected) {
    return NextResponse.json({ error: 'Invalid passcode' }, { status: 401 })
  }

  const hash = await hashPasscode(passcode)
  const response = NextResponse.json({ success: true })
  response.cookies.set(AUTH_COOKIE_NAME, hash, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  })

  return response
}
