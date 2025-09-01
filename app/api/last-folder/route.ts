import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

const DATA_FILE = path.join(process.cwd(), "data", "last-folders.json");

async function readStore(): Promise<Record<string, { path: string; count: number }>> {
  try {
    const txt = await fs.readFile(DATA_FILE, "utf8");
    return JSON.parse(txt);
  } catch {
    return {};
  }
}

async function writeStore(store: Record<string, { path: string; count: number }>) {
  await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
  await fs.writeFile(DATA_FILE, JSON.stringify(store, null, 2));
}

function getIp(req: NextRequest) {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0] ||
    (req.ip as string) ||
    "unknown"
  );
}

export async function GET(req: NextRequest) {
  const ip = getIp(req);
  const store = await readStore();
  const entry = store[ip];
  if (entry && entry.count > 0) {
    entry.count -= 1;
    if (entry.count <= 0) {
      delete store[ip];
    }
    await writeStore(store);
    return NextResponse.json({ path: entry.path });
  }
  return NextResponse.json({ path: null });
}

export async function POST(req: NextRequest) {
  const ip = getIp(req);
  const { path: folderPath } = await req.json();
  if (typeof folderPath !== "string" || !folderPath) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const store = await readStore();
  store[ip] = { path: folderPath, count: 10 };
  await writeStore(store);
  return NextResponse.json({ ok: true });
}
