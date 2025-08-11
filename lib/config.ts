import { promises as fs } from 'fs'
import path from 'path'

const BASE_SYSTEM = path.join(process.cwd(), 'gestor', 'system')
const NOTES_DIR = path.join(BASE_SYSTEM, 'notas')
const CAP_TEO = path.join(BASE_SYSTEM, 'capturas-teo')
const CAP_PRA = path.join(BASE_SYSTEM, 'capturas-prac')
const CONFIG_PATH = path.join(NOTES_DIR, 'config.json')

async function ensureDirs() {
  await Promise.all([
    fs.mkdir(NOTES_DIR, { recursive: true }),
    fs.mkdir(CAP_TEO, { recursive: true }),
    fs.mkdir(CAP_PRA, { recursive: true }),
  ])
}

export async function readConfig() {
  await ensureDirs()
  try {
    const data = await fs.readFile(CONFIG_PATH, 'utf-8')
    return JSON.parse(data)
  } catch {
    return {}
  }
}

export async function writeConfig(data: any) {
  await ensureDirs()
  await fs.writeFile(CONFIG_PATH, JSON.stringify(data, null, 2), 'utf-8')
}
