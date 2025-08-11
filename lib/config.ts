import { promises as fs } from 'fs'
import path from 'path'

const primary = path.join(process.cwd(), 'gestor', 'system', 'notas', 'config.json')
const fallback = path.join('/tmp', 'config.json')

async function readFile(p: string) {
  try {
    const data = await fs.readFile(p, 'utf-8')
    return JSON.parse(data)
  } catch {
    return null
  }
}

export async function readConfig() {
  const first = await readFile(primary)
  if (first) return first
  const second = await readFile(fallback)
  if (second) return second
  return {}
}

export async function writeConfig(data: any) {
  const payload = JSON.stringify(data, null, 2)
  try {
    await fs.mkdir(path.dirname(primary), { recursive: true })
    await fs.writeFile(primary, payload, 'utf-8')
  } catch {
    await fs.mkdir(path.dirname(fallback), { recursive: true })
    await fs.writeFile(fallback, payload, 'utf-8')
  }
}

