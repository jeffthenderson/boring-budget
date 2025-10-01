import { NextResponse } from 'next/server'
import { updateRecurringDefinition, deleteRecurringDefinition } from '@/lib/actions/recurring'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const data = await request.json()
  const definition = await updateRecurringDefinition(id, data)
  return NextResponse.json(definition)
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  await deleteRecurringDefinition(id)
  return NextResponse.json({ success: true })
}
