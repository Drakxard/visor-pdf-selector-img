import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import { readConfig } from '@/lib/config'

export async function POST(req: NextRequest) {
  const form = await req.formData()
  const file = form.get('file') as File | null
  const category = form.get('category') as string | null
  if (!file || !category) return NextResponse.json({ error: 'bad request' }, { status: 400 })
  const data = Buffer.from(await file.arrayBuffer())
  const cfg = await readConfig()
  const base = cfg.basePath || path.join(process.cwd(), 'gestor')
  const dir = path.join(base, 'system', `capturas-${category}`)
  await fs.mkdir(dir, { recursive: true })
  const filePath = path.join(dir, file.name)
  await fs.writeFile(filePath, data)
  return NextResponse.json({ ok: true })
}
