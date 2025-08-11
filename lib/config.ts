import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'

// Default to a writable tmp directory but allow the base ``gestor`` path
// to be overridden at runtime. The path is resolved as
//   <basePath>/system/notas/config.json
const fallbackDir =
  process.env.CONFIG_DIR || path.join(os.tmpdir(), 'gestor', 'system', 'notas')

function resolveConfigPath(base?: string) {
  const dir = base
    ? path.join(base, 'system', 'notas')
    : process.env.BASE_PATH
    ? path.join(process.env.BASE_PATH, 'system', 'notas')
    : fallbackDir
  return path.join(dir, 'config.json')
}

export async function readConfig(base?: string) {
  const configPath = resolveConfigPath(base)
  try {
    const data = await fs.readFile(configPath, 'utf-8')
    const json = JSON.parse(data)
    if (json.basePath && !process.env.BASE_PATH) {
      process.env.BASE_PATH = json.basePath
    }
    if (base && !process.env.BASE_PATH) {
      process.env.BASE_PATH = base
    }
    return json
  } catch {
    if (base) process.env.BASE_PATH = base
    return {}
  }
}

export async function writeConfig(data: any) {
  if (data.basePath) {
    process.env.BASE_PATH = data.basePath
  }
  const configPath = resolveConfigPath(data.basePath)
  try {
    await fs.mkdir(path.dirname(configPath), { recursive: true })
    await fs.writeFile(configPath, JSON.stringify(data, null, 2), 'utf-8')
    return true
  } catch (err) {
    console.error('writeConfig failed:', err)
    return false
  }
}
