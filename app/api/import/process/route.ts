import { NextResponse } from 'next/server'
import { processCSVImportWithMode } from '@/lib/actions/import'

export async function POST(request: Request) {
  try {
    const data = await request.json()
    const summary = await processCSVImportWithMode(
      data.accountId,
      data.rows,
      data.mapping,
      data.accountType,
      {
        periodMode: data.periodMode,
        periodId: data.periodId,
        targetYear: data.targetYear,
        targetMonth: data.targetMonth,
      }
    )
    return NextResponse.json(summary)
  } catch (error: any) {
    console.error('Import processing error:', error)
    return NextResponse.json({ error: error.message, stack: error.stack }, { status: 500 })
  }
}
