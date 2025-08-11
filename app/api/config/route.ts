import { NextResponse } from 'next/server'
import { readConfig, writeConfig } from '@/lib/config'

export async function GET() {
  const cfg = await readConfig()
  return NextResponse.json(cfg)
}

export async function POST(req: Request) {
  try {
    const data = await req.json()
    await writeConfig(data)
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('Failed to persist config', err)
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}
