import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db";

// Ensure we run on Node runtime (not edge)
export const runtime = "nodejs";

const pool = getPool();

export async function POST(req: NextRequest) {
  try {
    const { subject, tableType, delta } = await req.json();
    if (
      typeof subject !== "string" ||
      typeof tableType !== "string" ||
      typeof delta !== "number"
    ) {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }
    // Try update first (exact match)
    const updateQ = `
      UPDATE progress
      SET current_progress = LEAST(total_pdfs, GREATEST(0::int, current_progress + $1::int))
      WHERE subject_name = $2::text AND table_type = $3::text
      RETURNING id, subject_name, table_type, current_progress, total_pdfs;
    `;
    let res = await pool.query(updateQ, [delta, subject, tableType]);

    // If not found, try to resolve subject by accent-insensitive match against existing subjects
    if (res.rows.length === 0) {
      const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
      const { rows: subjRows } = await pool.query<{ subject_name: string }>(
        'SELECT DISTINCT subject_name FROM progress'
      );
      const canonical = subjRows.find(r => norm(r.subject_name) === norm(subject))?.subject_name;
      if (canonical) {
        res = await pool.query(updateQ, [delta, canonical, tableType]);
      }
    }

    if (res.rows.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Row not found',
          received: { subject, tableType },
          hint: 'El subject no coincide con ninguna fila existente. Revisa tildes y mayúsculas o crea la fila en DB.',
        },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, row: res.rows[0] });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json(
      {
        error: "Internal Server Error",
        message: err?.message || String(err),
        hint: "Verifica DATABASE_URL en .env.local y que la tabla public.progress exista con las columnas indicadas.",
      },
      { status: 500 }
    );
  }
}
