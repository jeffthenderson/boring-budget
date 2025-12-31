import { NextResponse } from 'next/server'
import { getPreallocationSettings, updatePreallocationSettings } from '@/lib/actions/user'

export async function GET() {
  const settings = await getPreallocationSettings()
  return NextResponse.json(settings)
}

export async function POST(request: Request) {
  const data = await request.json()
  const settings = await updatePreallocationSettings(data)
  return NextResponse.json(settings)
}
