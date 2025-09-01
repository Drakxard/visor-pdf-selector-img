import { NextRequest, NextResponse } from 'next/server'
import { getLastFolder, setLastFolder } from '@/lib/lastFolderStore'

export const runtime = 'nodejs'

function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  return (req.ip || '').split(',')[0] || '0.0.0.0'
}

export async function GET(req: NextRequest) {
  const ip = getClientIp(req)
  const path = await getLastFolder(ip)
  return NextResponse.json({ path })
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req)
  try {
    const body = await req.json()
    if (typeof body.path !== 'string') {
      return NextResponse.json({ error: 'Invalid path' }, { status: 400 })
    }
    await setLastFolder(ip, body.path)
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }
}
