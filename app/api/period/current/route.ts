import { NextResponse } from 'next/server'
import { getCurrentOrCreatePeriod } from '@/lib/actions/period'

export async function GET() {
  const period = await getCurrentOrCreatePeriod()
  return NextResponse.json(period)
}
