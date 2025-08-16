import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";

export const runtime = "nodejs";

const pool = getPool();

// GET /api/progress/subjects
// Returns the list of known subjects/table types from DB
export async function GET() {
  try {
    const { rows } = await pool.query(
      `SELECT subject_name, table_type, total_pdfs, current_progress FROM public.progress ORDER BY subject_name, table_type`
    );
    return NextResponse.json({ ok: true, rows });
  } catch (err: any) {
    console.error("/api/progress/subjects error", err);
    return NextResponse.json({ ok: false, error: err?.message || String(err) }, { status: 500 });
  }
}
