import { NextResponse } from 'next/server'
import { getAmazonOrders } from '@/lib/actions/amazon'

export async function GET() {
  const orders = await getAmazonOrders()
  return NextResponse.json(orders)
}
