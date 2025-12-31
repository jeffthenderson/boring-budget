import { NextResponse } from 'next/server'
import { updateAccount, deleteAccount } from '@/lib/actions/accounts'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const data = await request.json()
  const account = await updateAccount(id, data)
  return NextResponse.json(account)
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  await deleteAccount(id)
  return NextResponse.json({ success: true })
}
