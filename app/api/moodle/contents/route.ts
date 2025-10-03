import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { token, courseId } = await req.json();
    if (!token || !courseId) {
      return NextResponse.json(
        { ok: false, error: "Faltan token o courseId" },
        { status: 400 },
      );
    }

    const url = new URL("http://e-fich.unl.edu.ar/moodle/webservice/rest/server.php");
    url.searchParams.set("wstoken", token);
    url.searchParams.set("wsfunction", "core_course_get_contents");
    url.searchParams.set("moodlewsrestformat", "json");
    url.searchParams.set("courseid", String(courseId));

    const resp = await fetch(url.toString(), { cache: "no-store" });
    const text = await resp.text();

    if (!resp.ok) {
      return NextResponse.json(
        { ok: false, error: `Error HTTP ${resp.status}` },
        { status: resp.status },
      );
    }

    let data: any;
    try {
      data = JSON.parse(text);
    } catch (err) {
      return NextResponse.json(
        { ok: false, error: "Respuesta invalida del servidor" },
        { status: 502 },
      );
    }

    return NextResponse.json({ ok: true, data });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || "Error inesperado" },
      { status: 500 },
    );
  }
}
