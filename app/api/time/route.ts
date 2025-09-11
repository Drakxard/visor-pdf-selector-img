import { NextResponse } from "next/server"
import { getPool } from "@/lib/db"

const pool = getPool()

export async function GET() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS daily_time (
        date DATE PRIMARY KEY,
        day_of_week TEXT NOT NULL,
        seconds_total INTEGER NOT NULL DEFAULT 0
      )
    `)
    const today = new Date().toISOString().split('T')[0]
    const { rows } = await pool.query(
      'SELECT seconds_total FROM daily_time WHERE date=$1',
      [today],
    )
    const seconds = rows[0]?.seconds_total ?? 0
    return NextResponse.json({ seconds })
  } catch (err) {
    console.error('/api/time GET', err)
    return NextResponse.json({ error: 'db error' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const { seconds } = await req.json()
    if (!seconds || seconds <= 0) {
      return NextResponse.json({ seconds: 0 })
    }
    await pool.query(`
      CREATE TABLE IF NOT EXISTS daily_time (
        date DATE PRIMARY KEY,
        day_of_week TEXT NOT NULL,
        seconds_total INTEGER NOT NULL DEFAULT 0
      )
    `)
    const now = new Date()
    const date = now.toISOString().split('T')[0]
    const day = now.toLocaleDateString('es-ES', { weekday: 'long' })
    const upsert = `
      INSERT INTO daily_time (date, day_of_week, seconds_total)
      VALUES ($1, $2, $3)
      ON CONFLICT (date)
      DO UPDATE SET seconds_total = daily_time.seconds_total + EXCLUDED.seconds_total
      RETURNING seconds_total;
    `
    const { rows } = await pool.query(upsert, [date, day, seconds])
    return NextResponse.json({ seconds: rows[0].seconds_total })
  } catch (err) {
    console.error('/api/time POST', err)
    return NextResponse.json({ error: 'db error' }, { status: 500 })
  }
}
