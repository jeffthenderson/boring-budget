import { NextResponse } from 'next/server'
import { getAmazonMatchCandidates } from '@/lib/actions/amazon'

export async function POST(request: Request) {
  const body = await request.json()
  const orderId = body?.orderId

  if (!orderId || typeof orderId !== 'string') {
    return NextResponse.json({ error: 'orderId is required.' }, { status: 400 })
  }

  try {
    const result = await getAmazonMatchCandidates(orderId)
    return NextResponse.json(result)
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to load candidates.' }, { status: 400 })
  }
}
