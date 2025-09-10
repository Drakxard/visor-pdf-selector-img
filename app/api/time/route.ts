import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db";

export const runtime = "nodejs";

const pool = getPool();

export async function POST(req: NextRequest) {
  try {
    const { date, weekday, minutes } = await req.json();
    if (
      typeof date !== "string" ||
      typeof weekday !== "string" ||
      typeof minutes !== "number"
    ) {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }

    await pool.query(
      `INSERT INTO daily_time (date, weekday, minutes)
       VALUES ($1::date, $2::text, $3::int)
       ON CONFLICT (date) DO UPDATE SET weekday = EXCLUDED.weekday, minutes = EXCLUDED.minutes;`,
      [date, weekday, minutes]
    );

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json(
      {
        error: "Internal Server Error",
        message: err?.message || String(err),
      },
      { status: 500 }
    );
  }
}
