import { NextResponse } from 'next/server'
import { createLinkToken } from '@/lib/actions/plaid'

export async function POST() {
  try {
    const result = await createLinkToken()
    return NextResponse.json(result)
  } catch (error) {
    console.error('Error creating link token:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create link token' },
      { status: 500 }
    )
  }
}
