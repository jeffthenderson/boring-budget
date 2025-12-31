import { NextResponse } from 'next/server'
import { setAmazonOrderIgnored } from '@/lib/actions/amazon'

export async function POST(request: Request) {
  const body = await request.json()
  const orderId = body?.orderId
  const isIgnored = body?.isIgnored

  if (!orderId || typeof orderId !== 'string') {
    return NextResponse.json({ error: 'orderId is required.' }, { status: 400 })
  }

  if (typeof isIgnored !== 'boolean') {
    return NextResponse.json({ error: 'isIgnored must be a boolean.' }, { status: 400 })
  }

  try {
    const updated = await setAmazonOrderIgnored(orderId, isIgnored)
    return NextResponse.json(updated)
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to update order.' }, { status: 400 })
  }
}
