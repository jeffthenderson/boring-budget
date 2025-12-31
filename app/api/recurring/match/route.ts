import { NextResponse } from 'next/server'
import { matchExistingImportsForOpenPeriods } from '@/lib/actions/recurring'

export async function POST() {
  try {
    const result = await matchExistingImportsForOpenPeriods()
    return NextResponse.json(result)
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to match recurring transactions.' },
      { status: 500 }
    )
  }
}
