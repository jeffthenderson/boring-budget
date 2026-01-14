import { NextResponse } from 'next/server'
import {
  getRecurringSuggestions,
  dismissRecurringSuggestion,
  resetRecurringSuggestionDismissals,
} from '@/lib/actions/recurring-suggestions'

export async function GET() {
  const suggestions = await getRecurringSuggestions()
  return NextResponse.json(suggestions)
}

export async function POST(request: Request) {
  const data = await request.json()
  const result = await dismissRecurringSuggestion(data.key || '')
  return NextResponse.json(result)
}

export async function DELETE() {
  const result = await resetRecurringSuggestionDismissals()
  return NextResponse.json(result)
}
