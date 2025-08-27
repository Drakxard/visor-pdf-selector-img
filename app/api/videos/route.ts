import { NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import { extractUrlFromLnk } from '@/lib/lnk'

const SHORTCUT_DIR = process.env.SHORTCUT_DIR || path.join(process.cwd(), 'shortcuts')

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const rel = url.searchParams.get('dir') || ''
    // Prevent path traversal outside the base directory
    const dir = path.join(SHORTCUT_DIR, rel)

    const entries = await fs.readdir(dir)
    const videos = [] as { title: string; url: string }[]

    for (const file of entries) {
      const filePath = path.join(dir, file)
      const stat = await fs.stat(filePath)
      if (!stat.isFile()) continue
      const link = await extractUrlFromLnk(filePath)
      if (link) videos.push({ title: path.parse(file).name, url: link })
    }

    return NextResponse.json({ videos })
  } catch (err: any) {
    return NextResponse.json(
      { videos: [], error: err.message },
      { status: 500 },
    )
  }
}
