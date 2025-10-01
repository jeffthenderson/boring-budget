import { NextResponse } from 'next/server'
import { getAllRecurringDefinitions, createRecurringDefinition } from '@/lib/actions/recurring'

export async function GET() {
  const definitions = await getAllRecurringDefinitions()
  return NextResponse.json(definitions)
}

export async function POST(request: Request) {
  const data = await request.json()
  const definition = await createRecurringDefinition(data)
  return NextResponse.json(definition)
}
