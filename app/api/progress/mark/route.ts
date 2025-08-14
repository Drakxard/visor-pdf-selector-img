import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db'

export async function POST(req: NextRequest) {
  try {
    const { subjectName, tableType, checked } = await req.json()
    if (
      typeof subjectName !== 'string' ||
      typeof tableType !== 'string' ||
      typeof checked !== 'boolean'
    ) {
      return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
    }
    if (!checked) {
      return NextResponse.json({})
    }
    const { rows } = await pool.query(
      `INSERT INTO progress (subject_name, table_type, current_progress, total_pdfs)
       VALUES ($1,$2,1,0)
       ON CONFLICT (subject_name, table_type)
       DO UPDATE SET current_progress = LEAST(progress.current_progress + 1, progress.total_pdfs)
       RETURNING subject_name, table_type, current_progress, total_pdfs;`,
      [subjectName, tableType]
    )
    return NextResponse.json(rows[0])
  } catch (err) {
    console.error(err)
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    )
  }
}
