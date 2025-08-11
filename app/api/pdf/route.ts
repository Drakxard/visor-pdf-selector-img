import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import { readConfig } from '@/lib/config'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const filePath = searchParams.get('path')
  if (!filePath) return NextResponse.json({ error: 'path required' }, { status: 400 })
  const cfg = await readConfig()
  const base = cfg.basePath || path.join(process.cwd(), 'gestor')
  const abs = path.join(base, filePath)
  try {
    const data = await fs.readFile(abs)
    return new NextResponse(data, {
      headers: { 'Content-Type': 'application/pdf' },
    })
  } catch {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }
}
