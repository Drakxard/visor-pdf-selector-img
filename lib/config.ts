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
  await fs.writeFile(CONFIG_PATH, JSON.stringify(data, null, 2), 'utf-8')
}
