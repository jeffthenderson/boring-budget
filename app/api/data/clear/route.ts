import { NextResponse } from 'next/server'
import { clearUserData } from '@/lib/actions/data-import'

export async function POST() {
  try {
    const result = await clearUserData()

    if (!result.success) {
      return NextResponse.json({ error: result.message }, { status: 400 })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('Clear data error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Clear failed' },
      { status: 500 }
    )
  }
}
