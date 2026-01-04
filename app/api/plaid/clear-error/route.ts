import { NextResponse } from 'next/server'
import { clearAccountError } from '@/lib/actions/plaid'

export async function POST(request: Request) {
  try {
    const data = await request.json()

    if (!data.accountId) {
      return NextResponse.json(
        { error: 'accountId is required' },
        { status: 400 }
      )
    }

    await clearAccountError(data.accountId)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error clearing account error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to clear error' },
      { status: 500 }
    )
  }
}
