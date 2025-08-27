import { promises as fs } from 'fs'

export async function extractUrlFromLnk(filePath: string): Promise<string | null> {
  try {
    const buffer = await fs.readFile(filePath)
    // Convert to a byte-preserving string and strip null bytes to
    // consolidate potential UTF-16 sequences into regular text.
    const text = buffer.toString('latin1').replace(/\0/g, '')
    const match = text.match(/https?:\/\/[^\s"]+/i)
    return match ? match[0] : null
  } catch {
    return null
  }
}
