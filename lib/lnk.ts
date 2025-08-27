import { promises as fs } from 'fs'

/**
 * Extracts the first HTTP(S) URL from a Windows shortcut (.lnk) file.
 *
 * Scanning the entire file as a string proved unreliable because NUL
 * characters can appear inside the command line arguments. These NULs make a
 * simple regular expression capture the executable path as part of the match.
 *
 * To avoid that, this implementation searches the raw buffer for the UTF-16LE
 * or UTF-8 representation of "http" and then reads until a string terminator
 * is found.
 */
export async function extractUrlFromLnk(
  filePath: string,
): Promise<string | null> {
  try {
    const buffer = await fs.readFile(filePath)

    // Look for an UTF-16LE encoded http/https prefix
    const prefixUtf16 = Buffer.from('http', 'utf16le')
    let idx = buffer.indexOf(prefixUtf16)
    if (idx !== -1) {
      let end = idx
      // Strings in .lnk are UTF-16LE and terminated with double null
      while (end + 1 < buffer.length) {
        if (buffer[end] === 0x00 && buffer[end + 1] === 0x00) break
        end += 2
      }
      return buffer.slice(idx, end).toString('utf16le')
    }

    // Fallback to UTF-8 search
    const prefixUtf8 = Buffer.from('http', 'utf8')
    idx = buffer.indexOf(prefixUtf8)
    if (idx !== -1) {
      let end = idx
      while (end < buffer.length && buffer[end] !== 0x00) end++
      return buffer.slice(idx, end).toString('utf8')
    }

    return null
  } catch {
    return null
  }
}
