import { promises as fs } from 'fs'
import path from 'path'

/**
 * Extracts the first HTTP(S) URL from a Windows shortcut. Supports classic
 * `.lnk` files as well as Internet shortcuts (`.url`). If no URL can be
 * determined the function returns `null`.
 */
export async function extractUrlFromLnk(filePath: string): Promise<string | null> {
  try {
    const buffer = await fs.readFile(filePath)
    const ext = path.extname(filePath).toLowerCase()

    // Internet shortcuts store the URL in plain text as `URL=<link>`.
    const text = buffer
      .toString(ext === '.url' ? 'utf8' : 'latin1')
      .replace(/\0/g, '')

    if (ext === '.url') {
      const m = text.match(/^URL=(.+)$/m)
      return m ? m[1].trim() : null
    }

    const match = text.match(/https?:\/\/[^\s"]+/i)
    return match ? match[0] : null
  } catch {
    return null
  }
}
