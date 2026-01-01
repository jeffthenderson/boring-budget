import { NextResponse } from 'next/server'
import { createAmazonImportToken } from '@/lib/utils/amazon-token'
import { getAmazonCorsHeaders } from '@/lib/utils/amazon-cors'
import { requireUserId } from '@/lib/auth'

export async function OPTIONS(request: Request) {
  const corsHeaders = getAmazonCorsHeaders(request.headers.get('origin'))
  return new NextResponse(null, { status: 204, headers: corsHeaders })
}

export async function POST(request: Request) {
  const corsHeaders = getAmazonCorsHeaders(request.headers.get('origin'))
  const secret = process.env.AMAZON_IMPORT_SECRET || ''

  if (!secret) {
    return NextResponse.json(
      { error: 'Amazon import secret is not configured.' },
      { status: 400, headers: corsHeaders }
    )
  }

  let userId: string
  try {
    userId = await requireUserId()
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders })
  }
  const token = createAmazonImportToken(userId, secret)

  return NextResponse.json(token, { headers: corsHeaders })
}
