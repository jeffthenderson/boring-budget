import { NextResponse } from 'next/server'
import { linkAmazonOrder } from '@/lib/actions/amazon'

export async function POST(request: Request) {
  const body = await request.json()
  const orderId = body?.orderId
  const transactionId = body?.transactionId ?? null

  if (!orderId || typeof orderId !== 'string') {
    return NextResponse.json({ error: 'orderId is required.' }, { status: 400 })
  }

  try {
    const updated = await linkAmazonOrder(orderId, transactionId)
    return NextResponse.json(updated)
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to link order.' }, { status: 400 })
  }
}
