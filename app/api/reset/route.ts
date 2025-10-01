import { NextResponse } from 'next/server'
import { resetAllData } from '@/lib/actions/user'

export async function POST() {
  await resetAllData()
  return NextResponse.json({ success: true })
}
