import { NextResponse } from 'next/server'
import { unlinkPlaidAccount } from '@/lib/actions/plaid'

export async function POST(request: Request) {
  try {
    const data = await request.json()

    if (!data.accountId) {
      return NextResponse.json(
        { error: 'accountId is required' },
        { status: 400 }
      )
    }

    const result = await unlinkPlaidAccount(data.accountId)
    return NextResponse.json(result)
  } catch (error) {
    console.error('Error unlinking account:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to unlink account' },
      { status: 500 }
    )
  }
}
