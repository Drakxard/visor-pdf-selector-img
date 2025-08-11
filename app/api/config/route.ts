import { NextResponse } from 'next/server'
import { readConfig, writeConfig } from '@/lib/config'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const base = searchParams.get('base') || undefined
  const cfg = await readConfig(base)
  return NextResponse.json(cfg)
}

export async function POST(req: Request) {
  const data = await req
    .json()
    .catch(() => ({}))
  const ok = await writeConfig(data)
  return NextResponse.json({ ok }, { status: ok ? 200 : 500 })
}
