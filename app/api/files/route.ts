import { NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import { PDFDocument } from 'pdf-lib'
import { readConfig } from '@/lib/config'

export async function GET() {
  const cfg = await readConfig()
  const base = cfg.basePath || path.join(process.cwd(), 'gestor')
  const result: Record<number, Record<string, { path: string; name: string; pages: number }[]>> = {}
  try {
    const subjects = await fs.readdir(base)
    for (const subject of subjects) {
      const subjPath = path.join(base, subject)
      const stat = await fs.stat(subjPath)
      if (!stat.isDirectory()) continue
      const weeks = await fs.readdir(subjPath)
      for (const weekFolder of weeks) {
        const match = weekFolder.match(/sem(\d+)/i)
        if (!match) continue
        const week = parseInt(match[1])
        const weekPath = path.join(subjPath, weekFolder)
        const files = await fs.readdir(weekPath)
        for (const file of files) {
          if (!file.toLowerCase().endsWith('.pdf')) continue
          const abs = path.join(weekPath, file)
          let pages = 0
          try {
            const data = await fs.readFile(abs)
            const pdf = await PDFDocument.load(data)
            pages = pdf.getPageCount()
          } catch {}
          if (!result[week]) result[week] = {}
          if (!result[week][subject]) result[week][subject] = []
          result[week][subject].push({
            path: path.relative(base, abs),
            name: file,
            pages,
          })
        }
      }
    }
  } catch {}
  return NextResponse.json(result)
}
