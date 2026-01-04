import { NextResponse } from 'next/server'
import { exchangePublicToken } from '@/lib/actions/plaid'

export async function POST(request: Request) {
  try {
    const data = await request.json()

    if (!data.publicToken || !data.accountId) {
      return NextResponse.json(
        { error: 'publicToken and accountId are required' },
        { status: 400 }
      )
    }

    const result = await exchangePublicToken({
      publicToken: data.publicToken,
      accountId: data.accountId,
      institutionId: data.institutionId,
      institutionName: data.institutionName,
      plaidAccountId: data.plaidAccountId,
    })

    return NextResponse.json(result)
  } catch (error) {
    console.error('Error exchanging token:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to exchange token' },
      { status: 500 }
    )
  }
}
