import { promises as fs } from 'fs'
import path from 'path'

const CONFIG_PATH = path.join(
  process.cwd(),
  'gestor',
  'system',
  'notas',
  'config.json'
)

export async function readConfig() {
  try {
    const data = await fs.readFile(CONFIG_PATH, 'utf-8')
    return JSON.parse(data)
  } catch {
    return {}
  }
}

export async function writeConfig(data: any) {
  await fs.mkdir(path.dirname(CONFIG_PATH), { recursive: true })
  let current: any = {}
  try {
    const raw = await fs.readFile(CONFIG_PATH, 'utf-8')
    current = JSON.parse(raw)
  } catch {
    current = {}
  }
  const merged = { ...current, ...data }
  await fs.writeFile(CONFIG_PATH, JSON.stringify(merged, null, 2), 'utf-8')
}
