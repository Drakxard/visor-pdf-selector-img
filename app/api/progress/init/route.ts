import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";

export const runtime = "nodejs";

const pool = getPool();

// GET /api/progress/init
// Creates the progress table on Neon if missing and seeds initial rows
export async function GET() {
  try {
    const createSql = `
      CREATE TABLE IF NOT EXISTS public.progress (
        id SERIAL PRIMARY KEY,
        subject_name TEXT NOT NULL,
        table_type   TEXT NOT NULL,
        current_progress INTEGER NOT NULL DEFAULT 0,
        total_pdfs       INTEGER NOT NULL DEFAULT 0
      );

      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'progress_subject_table_unique'
        ) THEN
          CREATE UNIQUE INDEX progress_subject_table_unique ON public.progress (subject_name, table_type);
        END IF;
      END $$;
    `;

    await pool.query(createSql);

    // Seed rows provided by the user
    const seed = [
      { subject_name: "Álgebra", table_type: "theory", current_progress: 1, total_pdfs: 6 },
      { subject_name: "Álgebra", table_type: "practice", current_progress: 0, total_pdfs: 6 },
      { subject_name: "Cálculo", table_type: "theory", current_progress: 1, total_pdfs: 2 },
      { subject_name: "Cálculo", table_type: "practice", current_progress: 0, total_pdfs: 2 },
      { subject_name: "Poo", table_type: "theory", current_progress: 1, total_pdfs: 2 },
      { subject_name: "Poo", table_type: "practice", current_progress: 1, total_pdfs: 15 },
    ];

    const upsertSql = `
      INSERT INTO public.progress (subject_name, table_type, current_progress, total_pdfs)
      VALUES ($1::text, $2::text, $3::int, $4::int)
      ON CONFLICT (subject_name, table_type)
      DO UPDATE SET
        current_progress = EXCLUDED.current_progress,
        total_pdfs = EXCLUDED.total_pdfs
      RETURNING id;
    `;

    const results: number[] = [];
    for (const r of seed) {
      const { rows } = await pool.query(upsertSql, [
        r.subject_name,
        r.table_type,
        r.current_progress,
        r.total_pdfs,
      ]);
      if (rows[0]?.id) results.push(rows[0].id);
    }

    return NextResponse.json({ ok: true, created_or_updated: results.length, ids: results });
  } catch (err: any) {
    console.error("/api/progress/init error", err);
    return NextResponse.json({ ok: false, error: err?.message || String(err) }, { status: 500 });
  }
}
