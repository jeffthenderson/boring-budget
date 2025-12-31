import { NextResponse } from 'next/server'
import { categorizeAmazonOrdersWithLLM } from '@/lib/actions/amazon'

export async function POST() {
  try {
    const result = await categorizeAmazonOrdersWithLLM()
    return NextResponse.json(result)
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to categorize orders.' },
      { status: 500 }
    )
  }
}
