import { NextResponse } from 'next/server'
import { importUserData } from '@/lib/actions/data-import'
import type { ExportData } from '@/lib/actions/data-export'

export async function POST(request: Request) {
  try {
    const data: ExportData = await request.json()

    if (!data.version || !data.exportedAt) {
      return NextResponse.json(
        { error: 'Invalid export file format' },
        { status: 400 }
      )
    }

    const result = await importUserData(data)

    if (!result.success) {
      return NextResponse.json({ error: result.message }, { status: 400 })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('Import error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Import failed' },
      { status: 500 }
    )
  }
}
