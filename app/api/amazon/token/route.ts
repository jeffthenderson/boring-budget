import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { AUTH_COOKIE_NAME, getExpectedPasscodeHash } from '@/lib/auth'
import { createAmazonImportToken } from '@/lib/utils/amazon-token'
import { getOrCreateUser } from '@/lib/actions/user'
import { getAmazonCorsHeaders } from '@/lib/utils/amazon-cors'

function getImportSecret() {
  return process.env.AMAZON_IMPORT_SECRET || process.env.BB_PASSCODE || ''
}

async function isAuthorized(passcode?: string | null) {
  const expectedPasscode = process.env.BB_PASSCODE
  if (!expectedPasscode) return false

  if (passcode && passcode === expectedPasscode) {
    return true
  }

  const expectedHash = await getExpectedPasscodeHash()
  const cookieStore = await cookies()
  const cookieValue = cookieStore.get(AUTH_COOKIE_NAME)?.value
  return Boolean(expectedHash && cookieValue && cookieValue === expectedHash)
}

export async function OPTIONS(request: Request) {
  const corsHeaders = getAmazonCorsHeaders(request.headers.get('origin'))
  return new NextResponse(null, { status: 204, headers: corsHeaders })
}

export async function POST(request: Request) {
  const corsHeaders = getAmazonCorsHeaders(request.headers.get('origin'))
  const secret = getImportSecret()

  if (!secret) {
    return NextResponse.json(
      { error: 'Passcode authentication is not configured.' },
      { status: 400, headers: corsHeaders }
    )
  }

  let passcode: string | null = null
  try {
    const body = await request.json()
    passcode = typeof body?.passcode === 'string' ? body.passcode : null
  } catch {
    passcode = null
  }

  const authorized = await isAuthorized(passcode)
  if (!authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders })
  }

  const user = await getOrCreateUser()
  const token = createAmazonImportToken(user.id, secret)

  return NextResponse.json(token, { headers: corsHeaders })
}
