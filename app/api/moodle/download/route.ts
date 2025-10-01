import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { url, token } = await req.json();
    if (!url || !token) {
      return NextResponse.json(
        { ok: false, error: "Faltan url o token" },
        { status: 400 },
      );
    }

    const target = new URL(url.replace(/^https:/i, "http:"));
    target.searchParams.set("token", token);

    const fileResp = await fetch(target.toString(), { cache: "no-store" });
    if (!fileResp.ok) {
      return NextResponse.json(
        { ok: false, error: `Error HTTP ${fileResp.status}` },
        { status: fileResp.status },
      );
    }

    const arrayBuffer = await fileResp.arrayBuffer();
    const headers = new Headers();
    const contentType = fileResp.headers.get("content-type") || "application/octet-stream";
    headers.set("Content-Type", contentType);
    return new Response(Buffer.from(arrayBuffer), { status: 200, headers });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || "Error inesperado" },
      { status: 500 },
    );
  }
}
