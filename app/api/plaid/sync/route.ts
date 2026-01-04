import { NextResponse } from 'next/server'
import { syncPlaidTransactions } from '@/lib/plaid/sync'
import { getAccount } from '@/lib/actions/accounts'

export async function POST(request: Request) {
  try {
    const data = await request.json()

    if (!data.accountId) {
      return NextResponse.json(
        { error: 'accountId is required' },
        { status: 400 }
      )
    }

    // Verify the account exists and belongs to the user
    const account = await getAccount(data.accountId)
    if (!account) {
      return NextResponse.json(
        { error: 'Account not found' },
        { status: 404 }
      )
    }

    if (!account.plaidItemId) {
      return NextResponse.json(
        { error: 'Account is not linked to Plaid' },
        { status: 400 }
      )
    }

    const result = await syncPlaidTransactions(data.accountId)

    return NextResponse.json({
      success: true,
      ...result,
    })
  } catch (error) {
    console.error('Error syncing transactions:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to sync transactions' },
      { status: 500 }
    )
  }
}
