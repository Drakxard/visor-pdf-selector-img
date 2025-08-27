import { NextResponse } from "next/server";
import { readdir } from "fs/promises";
import path from "path";
import ws from "windows-shortcuts";

export const runtime = "nodejs";

const SHORTCUT_DIR = process.env.SHORTCUT_DIR || path.join(process.cwd(), "shortcuts");

function parseShortcut(filePath: string): Promise<string | null> {
  return new Promise((resolve) => {
    ws.query(filePath, (err, opts) => {
      if (err) return resolve(null);
      const args = String(opts?.args || "");
      const urlMatch = args.match(/https?:\/\/\S+/i);
      resolve(urlMatch ? urlMatch[0] : null);
    });
  });
}

export async function GET() {
  try {
    const files = await readdir(SHORTCUT_DIR);
    const videos: { title: string; url: string }[] = [];
    for (const f of files) {
      if (f.toLowerCase().endsWith(".lnk")) {
        const fp = path.join(SHORTCUT_DIR, f);
        const url = await parseShortcut(fp);
        if (url) {
          videos.push({ title: path.basename(f, ".lnk"), url });
        }
      }
    }
    return NextResponse.json({ ok: true, videos });
  } catch (err: any) {
    console.error("Failed to read shortcuts", err);
    return NextResponse.json({ ok: false, error: "Failed to read shortcuts", message: err?.message }, { status: 500 });
  }
}
