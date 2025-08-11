import { NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'

const BASE_NOTES = path.join(process.cwd(), 'gestor', 'system', 'notas')
const PROMPTS_FILE = path.join(BASE_NOTES, 'prompts.json')

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const file = searchParams.get('file')
  const target = file ? path.join(BASE_NOTES, file) : PROMPTS_FILE
  try {
    const data = await fs.readFile(target, 'utf-8')
    return NextResponse.json(JSON.parse(data))
  } catch {
    return NextResponse.json({})
  }
}

export async function POST(req: Request) {
  const { searchParams } = new URL(req.url)
  const file = searchParams.get('file')
  const target = file ? path.join(BASE_NOTES, file) : PROMPTS_FILE
  try {
    const data = await req.json()
    await fs.mkdir(path.dirname(target), { recursive: true })
    await fs.writeFile(target, JSON.stringify(data, null, 2), 'utf-8')
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
