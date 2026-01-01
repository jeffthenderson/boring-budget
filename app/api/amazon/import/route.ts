import { NextResponse } from 'next/server'
import { verifyAmazonImportToken } from '@/lib/utils/amazon-token'
import { importAmazonOrders } from '@/lib/actions/amazon'
import { getAmazonCorsHeaders } from '@/lib/utils/amazon-cors'

function getImportSecret() {
  return process.env.AMAZON_IMPORT_SECRET || ''
}

function extractToken(request: Request, bodyToken?: string | null) {
  if (bodyToken && typeof bodyToken === 'string') return bodyToken
  const authHeader = request.headers.get('authorization')
  if (authHeader?.toLowerCase().startsWith('bearer ')) {
    return authHeader.slice(7).trim()
  }
  return null
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
      { error: 'Amazon import secret is not configured.' },
      { status: 400, headers: corsHeaders }
    )
  }

  let body: any
  try {
    body = await request.json()
  } catch {
    body = null
  }

  const token = extractToken(request, body?.token)
  if (!token) {
    return NextResponse.json({ error: 'Missing import token.' }, { status: 401, headers: corsHeaders })
  }

  const tokenData = verifyAmazonImportToken(token, secret)
  if (!tokenData) {
    return NextResponse.json({ error: 'Invalid or expired import token.' }, { status: 401, headers: corsHeaders })
  }

  const orders = Array.isArray(body?.orders) ? body.orders : null
  if (!orders) {
    return NextResponse.json({ error: 'Missing orders payload.' }, { status: 400, headers: corsHeaders })
  }

  try {
    const summary = await importAmazonOrders(tokenData.userId, orders, body?.sourceUrl)
    return NextResponse.json(summary, { headers: corsHeaders })
  } catch (error: any) {
    console.error('Amazon import failed:', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to import Amazon orders.' },
      { status: 500, headers: corsHeaders }
    )
  }
}
