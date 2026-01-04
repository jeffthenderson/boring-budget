import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireUserId } from '@/lib/auth'

export async function GET() {
  try {
    const userId = await requireUserId()

    const accounts = await prisma.account.findMany({
      where: { userId },
      select: {
        id: true,
        name: true,
        type: true,
        plaidItemId: true,
        plaidAccountId: true,
        plaidInstitutionName: true,
        plaidSyncCursor: true,
        plaidLastSyncAt: true,
        plaidError: true,
        _count: {
          select: {
            transactions: true,
          },
        },
      },
    })

    // Get recent webhook logs
    const webhookLogs = await prisma.plaidWebhookLog.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        webhookType: true,
        webhookCode: true,
        itemId: true,
        error: true,
        createdAt: true,
      },
    })

    return NextResponse.json({
      accounts: accounts.map(a => ({
        ...a,
        transactionCount: a._count.transactions,
        hasPlaidCredentials: Boolean(a.plaidItemId),
        hasSyncCursor: Boolean(a.plaidSyncCursor),
      })),
      recentWebhooks: webhookLogs,
    })
  } catch (error) {
    console.error('Debug endpoint error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get status' },
      { status: 500 }
    )
  }
}
