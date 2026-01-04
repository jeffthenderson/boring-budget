import { NextResponse } from 'next/server'
import { createUpdateModeLinkToken } from '@/lib/actions/plaid'

export async function POST(request: Request) {
  try {
    const data = await request.json()

    if (!data.accountId) {
      return NextResponse.json(
        { error: 'accountId is required' },
        { status: 400 }
      )
    }

    const result = await createUpdateModeLinkToken(data.accountId)

    return NextResponse.json(result)
  } catch (error) {
    console.error('Error creating update mode link token:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create update link token' },
      { status: 500 }
    )
  }
}
