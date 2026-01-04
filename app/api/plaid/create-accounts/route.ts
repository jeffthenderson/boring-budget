import { NextResponse } from 'next/server'
import { createAccountsFromPlaid } from '@/lib/actions/plaid'
import { syncPlaidTransactions } from '@/lib/plaid/sync'
import { prisma } from '@/lib/db'

export async function POST(request: Request) {
  try {
    const data = await request.json()

    if (!data.publicToken || !data.accounts || data.accounts.length === 0) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Create accounts using server action
    const result = await createAccountsFromPlaid({
      publicToken: data.publicToken,
      institutionId: data.institutionId,
      institutionName: data.institutionName,
      accounts: data.accounts,
    })

    // Trigger parallel syncs for all created accounts
    const syncResults = await Promise.allSettled(
      result.accountIds.map(async (accountId) => {
        const account = await prisma.account.findUnique({
          where: { id: accountId },
        })

        const syncResult = await syncPlaidTransactions(accountId)

        return {
          accountId,
          accountName: account?.name || 'Unknown',
          added: syncResult.added,
          errors: syncResult.errors,
        }
      })
    )

    // Format sync results
    const formattedSyncResults = syncResults.map((syncResult, index) => {
      if (syncResult.status === 'fulfilled') {
        return syncResult.value
      } else {
        return {
          accountId: result.accountIds[index],
          accountName: data.accounts[index].name,
          added: 0,
          errors: [syncResult.reason?.message || 'Sync failed'],
        }
      }
    })

    return NextResponse.json({
      success: true,
      accountIds: result.accountIds,
      syncResults: formattedSyncResults,
    })
  } catch (error) {
    console.error('Error creating accounts:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create accounts',
        accountIds: [],
        syncResults: [],
      },
      { status: 500 }
    )
  }
}
