import { NextResponse } from 'next/server'
import fg from 'fast-glob'
import { pool } from '@/lib/db'
import path from 'path'

export async function POST() {
  try {
    const files = await fg('public/pdfs/*/*/*.pdf')
    const counts = new Map<string, number>()
    for (const p of files) {
      const parts = p.split(path.posix.sep)
      const subject = parts[2]
      const tableType = parts[3]
      const key = `${subject}__${tableType}`
      counts.set(key, (counts.get(key) || 0) + 1)
    }
    const results = []
    for (const [key, total] of counts) {
      const [subject, tableType] = key.split('__')
      const r = await pool.query(
        `INSERT INTO progress (subject_name, table_type, current_progress, total_pdfs)
         VALUES ($1,$2,0,$3)
         ON CONFLICT (subject_name, table_type)
         DO UPDATE SET total_pdfs = EXCLUDED.total_pdfs
         RETURNING subject_name, table_type, current_progress, total_pdfs;`,
        [subject, tableType, total]
      )
      results.push(r.rows[0])
    }
    return NextResponse.json(results)
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
