import { NextResponse } from 'next/server'
import { getIgnoreRules, createIgnoreRule } from '@/lib/actions/ignore-rules'

export async function GET() {
  const rules = await getIgnoreRules()
  return NextResponse.json(rules)
}

export async function POST(request: Request) {
  const data = await request.json()
  const result = await createIgnoreRule(data.pattern || '')
  return NextResponse.json(result)
}
