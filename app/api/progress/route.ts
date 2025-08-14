import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

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
    await pool.query(
      "UPDATE progress SET current_progress = LEAST(total_pdfs, GREATEST(0, current_progress + $1)) WHERE subject_name = $2 AND table_type = $3",
      [delta, subject, tableType]
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
