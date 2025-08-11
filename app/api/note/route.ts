import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const name = searchParams.get('name')
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 })
  const file = path.join(process.cwd(), 'gestor', 'system', 'notas', name)
  try {
    const data = await fs.readFile(file, 'utf-8')
    return NextResponse.json(JSON.parse(data))
  } catch {
    return NextResponse.json({})
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { name, data } = body
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 })
  const dir = path.join(process.cwd(), 'gestor', 'system', 'notas')
  await fs.mkdir(dir, { recursive: true })
  const file = path.join(dir, name)
  await fs.writeFile(file, JSON.stringify(data, null, 2), 'utf-8')
  return NextResponse.json({ ok: true })
}
