import { NextResponse } from "next/server"
import { Pool } from "pg"

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

export async function POST(req: Request) {
  try {
    const { subject, type } = await req.json()
    if (!subject || !type) {
      return NextResponse.json({ error: "Missing subject or type" }, { status: 400 })
    }
    const client = await pool.connect()
    try {
      const result = await client.query(
        "SELECT current_progress, total_pdfs FROM progress WHERE subject_name=$1 AND table_type=$2",
        [subject, type],
      )
      if (result.rows.length === 0) {
        return NextResponse.json({ error: "Not found" }, { status: 404 })
      }
      const row = result.rows[0]
      const current = Number(row.current_progress) || 0
      const total = Number(row.total_pdfs) || 0
      const next = current < total ? current + 1 : total
      await client.query(
        "UPDATE progress SET current_progress=$1 WHERE subject_name=$2 AND table_type=$3",
        [next, subject, type],
      )
      return NextResponse.json({ current_progress: next })
    } finally {
      client.release()
    }
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
