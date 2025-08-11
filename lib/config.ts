import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'

// Vercel's serverless environment is read-only outside of /tmp, so fall back to
// a writable tmp directory when a real ``gestor`` path is unavailable.
const baseDir = process.env.CONFIG_DIR || path.join(os.tmpdir(), 'gestor', 'system', 'notas')
const CONFIG_PATH = path.join(baseDir, 'config.json')

export async function readConfig() {
  try {
    const data = await fs.readFile(CONFIG_PATH, 'utf-8')
    return JSON.parse(data)
  } catch {
    return {}
  }
}

export async function writeConfig(data: any) {
  try {
    await fs.mkdir(path.dirname(CONFIG_PATH), { recursive: true })
    await fs.writeFile(CONFIG_PATH, JSON.stringify(data, null, 2), 'utf-8')
    return true
  } catch (err) {
    console.error('writeConfig failed:', err)
    return false
  }
}
