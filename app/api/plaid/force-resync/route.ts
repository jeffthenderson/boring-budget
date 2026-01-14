import { NextResponse } from 'next/server'
import { forceResyncPlaidTransactions } from '@/lib/plaid/sync'
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

    const days = typeof data.days === 'number' && data.days > 0 ? data.days : 90

    console.log(`Starting force resync for account ${data.accountId} (${days} days)`) 

    const result = await forceResyncPlaidTransactions(data.accountId, days)

    console.log(`Force resync complete for account ${data.accountId}:`, JSON.stringify(result))

    return NextResponse.json({
      success: true,
      ...result,
    })
  } catch (error) {
    console.error('Error force resyncing transactions:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to force resync transactions' },
      { status: 500 }
    )
  }
}
