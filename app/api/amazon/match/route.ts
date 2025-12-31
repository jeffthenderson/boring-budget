import { NextResponse } from 'next/server'
import { matchAmazonOrders } from '@/lib/actions/amazon'

export async function POST(request: Request) {
  let body: any
  try {
    body = await request.json()
  } catch {
    body = null
  }

  const orderIds = Array.isArray(body?.orderIds) ? body.orderIds : undefined
  const result = await matchAmazonOrders({ orderIds })
  return NextResponse.json(result)
}
