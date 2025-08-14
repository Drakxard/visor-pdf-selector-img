import { NextResponse } from 'next/server'
import fg from 'fast-glob'
import path from 'path'
import { pool } from '@/lib/db'

export async function POST() {
  try {
    const files = await fg('public/pdfs/**/**.pdf')
    const counts = new Map<string, number>()
    for (const file of files) {
      const parts = file.split(path.sep)
      const subject = parts[2]
      const tableType = parts[3]
      if (!subject || !tableType) continue
      const key = `${subject}|${tableType}`
      counts.set(key, (counts.get(key) || 0) + 1)
    }
    const results = []
    for (const [key, count] of counts) {
      const [subject, tableType] = key.split('|')
      const { rows } = await pool.query(
        `INSERT INTO progress (subject_name, table_type, current_progress, total_pdfs)
         VALUES ($1,$2,0,$3)
         ON CONFLICT (subject_name, table_type)
         DO UPDATE SET total_pdfs = EXCLUDED.total_pdfs
         RETURNING subject_name, table_type, current_progress, total_pdfs;`,
        [subject, tableType, count]
      )
      results.push(rows[0])
    }
    return NextResponse.json(results)
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
