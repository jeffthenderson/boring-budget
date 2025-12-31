import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { AUTH_COOKIE_NAME, getExpectedPasscodeHash } from '@/lib/auth'

const PUBLIC_PATH_PREFIXES = [
  '/login',
  '/api/login',
  '/api/logout',
  '/_next',
  '/favicon.ico',
]

export async function middleware(request: NextRequest) {
  const passcode = process.env.BB_PASSCODE
  if (!passcode) {
    return NextResponse.next()
  }

  const { pathname } = request.nextUrl
  if (PUBLIC_PATH_PREFIXES.some(prefix => pathname.startsWith(prefix))) {
    return NextResponse.next()
  }

  const expectedHash = await getExpectedPasscodeHash()
  const cookieValue = request.cookies.get(AUTH_COOKIE_NAME)?.value

  if (!expectedHash || !cookieValue || cookieValue !== expectedHash) {
    if (pathname.startsWith('/api')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  matcher: '/:path*',
}
