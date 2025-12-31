import { NextResponse } from 'next/server'
import { deleteIgnoreRule, toggleIgnoreRule } from '@/lib/actions/ignore-rules'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const data = await request.json()
  const rule = await toggleIgnoreRule(id, data.active)
  return NextResponse.json(rule)
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  await deleteIgnoreRule(id)
  return NextResponse.json({ success: true })
}
