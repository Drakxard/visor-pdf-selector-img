import { NextResponse } from "next/server";

// Simple health check endpoint (no external deps) to keep route available without Supabase
export async function GET() {
  return NextResponse.json({
    status: "ok",
    message: "Test DB endpoint activo",
    timestamp: new Date().toISOString(),
  })
}