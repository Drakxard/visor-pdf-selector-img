import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";

export async function GET() {
  const dir = process.env.SHORTCUT_DIR || path.join(process.cwd(), "shortcuts");
  let items: { title: string; url: string }[] = [];
  try {
    const files = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".lnk"));
    items = files
      .map((file) => {
        const full = path.join(dir, file);
        let args = "";
        if (process.platform === "win32") {
          try {
            const ps = `$s=(New-Object -ComObject WScript.Shell).CreateShortcut('${full.replace(/'/g, "''")}'); Write-Output $s.Arguments`;
            args = execSync(`powershell.exe -NoProfile -Command \"${ps}\"`, { encoding: "utf8" }).trim();
          } catch {}
        }
        const match = args.match(/https?:\/\/\S+/);
        const url = match ? match[0] : "";
        return { title: path.basename(file, ".lnk"), url };
      })
      .filter((v) => v.url);
  } catch {}
  return NextResponse.json(items);
}
