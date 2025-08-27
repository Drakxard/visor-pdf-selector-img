import { promises as fs } from 'fs'

export async function extractUrlFromLnk(filePath: string): Promise<string | null> {
  try {
    const buffer = await fs.readFile(filePath)
    // .lnk files are binary but often contain URLs as UTF-16LE strings
    let text = buffer.toString('utf16le')
    let match = text.match(/https?:\/\/[^\s"]+/)
    if (match) return match[0]
    // Fallback to utf8 in case encoding differs
    text = buffer.toString('utf8')
    match = text.match(/https?:\/\/[^\s"]+/)
    return match ? match[0] : null
  } catch {
    return null
  }
}
