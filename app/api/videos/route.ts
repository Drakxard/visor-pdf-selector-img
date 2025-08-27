import { NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import { extractUrlFromLnk } from '@/lib/lnk'

const SHORTCUT_DIR = process.env.SHORTCUT_DIR || path.join(process.cwd(), 'shortcuts')

export async function GET() {
  try {
    const entries = await fs.readdir(SHORTCUT_DIR)
    const videos = await Promise.all(
      entries
        .filter((f) => f.toLowerCase().endsWith('.lnk'))
        .map(async (file) => {
          const filePath = path.join(SHORTCUT_DIR, file)
          const url = await extractUrlFromLnk(filePath)
          return {
            title: path.parse(file).name,
            url,
          }
        }),
    )
    return NextResponse.json({ videos })
  } catch (err: any) {
    return NextResponse.json(
      { videos: [], error: err.message },
      { status: 500 },
    )
  }
}
