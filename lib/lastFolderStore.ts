import { promises as fs } from 'fs'
import path from 'path'

const DATA_FILE = path.join(process.cwd(), 'data', 'last-folders.json')

interface Entry {
  ip: string
  path: string
  timestamp: number
}

async function readStore(): Promise<Entry[]> {
  try {
    const txt = await fs.readFile(DATA_FILE, 'utf8')
    return JSON.parse(txt) as Entry[]
  } catch {
    return []
  }
}

async function writeStore(entries: Entry[]): Promise<void> {
  await fs.mkdir(path.dirname(DATA_FILE), { recursive: true })
  await fs.writeFile(DATA_FILE, JSON.stringify(entries, null, 2), 'utf8')
}

export async function getLastFolder(ip: string): Promise<string | null> {
  const entries = await readStore()
  const found = entries.find((e) => e.ip === ip)
  return found ? found.path : null
}

export async function setLastFolder(ip: string, folder: string): Promise<void> {
  const entries = await readStore()
  const filtered = entries.filter((e) => e.ip !== ip)
  filtered.unshift({ ip, path: folder, timestamp: Date.now() })
  if (filtered.length > 10) filtered.length = 10
  await writeStore(filtered)
}
