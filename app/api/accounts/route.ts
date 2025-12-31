import { NextResponse } from 'next/server'
import { getAllAccounts, createAccount } from '@/lib/actions/accounts'

export async function GET() {
  const accounts = await getAllAccounts()
  return NextResponse.json(accounts)
}

export async function POST(request: Request) {
  const data = await request.json()
  const account = await createAccount(data)
  return NextResponse.json(account)
}
