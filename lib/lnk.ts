export async function extractUrlFromLnk(file: File): Promise<string | null> {
  // Read file as ArrayBuffer and attempt to decode any embedded URL
  const buffer = await file.arrayBuffer()
  // .lnk files typically use UTF-16LE encoding for strings
  const text = new TextDecoder('utf-16le').decode(buffer)
  const match = text.match(/https?:\/\/[^\s"]+/)
  return match ? match[0] : null
}

export function youtubeEmbedUrl(url: string): string {
  try {
    const idMatch = url.match(/(?:v=|youtu\.be\/)([\w-]{11})/)
    const id = idMatch ? idMatch[1] : null
    return id ? `https://www.youtube.com/embed/${id}` : url
  } catch {
    return url
  }
}
