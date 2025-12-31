import { NextResponse } from 'next/server'
import { resetAllData } from '@/lib/actions/user'

export async function POST() {
  try {
    await resetAllData()
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Reset failed:', error)
    return NextResponse.json(
      { success: false, error: error?.message || 'Reset failed' },
      { status: 500 }
    )
  }
}
