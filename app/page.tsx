"use client"

import { useEffect, useState } from "react"
import { useTheme } from "next-themes"
import * as XLSX from "xlsx"

const DAYS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"] as const

export default function Home() {
  const [started, setStarted] = useState(false)
  const [setupComplete, setSetupComplete] = useState(true)
  const [step, setStep] = useState(1)
  const [files, setFiles] = useState<File[]>([])
  const [subjects, setSubjects] = useState<string[]>([])
  const [theoryDays, setTheoryDays] = useState<string[]>([])
  const [practiceDays, setPracticeDays] = useState<string[]>([])
  const [maxWeeks, setMaxWeeks] = useState(1)
  const { setTheme } = useTheme()

  useEffect(() => {
    const hour = new Date().getHours()
    if (hour >= 19 || hour < 6) {
      setTheme("dark")
    } else {
      setTheme("light")
    }
    const storedSetup = localStorage.getItem("setupComplete")
    if (!storedSetup) setSetupComplete(false)
    const storedWeeks = localStorage.getItem("maxWeeks")
    if (storedWeeks) setMaxWeeks(parseInt(storedWeeks, 10))
  }, [setTheme])

  useEffect(() => {
    const handler = () => setStarted(true)
    if (!started) {
      window.addEventListener("keydown", handler)
      window.addEventListener("click", handler)
      return () => {
        window.removeEventListener("keydown", handler)
        window.removeEventListener("click", handler)
      }
    }
  }, [started])

  if (!started) {
    const hour = new Date().getHours()
    const greeting = hour >= 19 || hour < 6 ? "Buenas noches" : "Buenos días"
    return (
      <main className="min-h-screen flex items-center justify-center text-2xl">
        <p>{greeting}. Presiona cualquier tecla para continuar.</p>
      </main>
    )
  }

  if (!setupComplete) {
    if (step === 1) {
      return (
        <main className="min-h-screen flex flex-col items-center justify-center gap-4 p-4">
          <p>Comencemos a configurar el entorno</p>
          <p>Paso 1: Sube tus cronogramas (Excel)</p>
          <input
            type="file"
            multiple
            accept=".xlsx,.xls"
            onChange={(e) => setFiles(Array.from(e.target.files || []))}
          />
          <button
            onClick={() => {
              if (files.length > 0) {
                setSubjects(new Array(files.length).fill(""))
                setStep(2)
              }
            }}
            className="border px-3 py-1"
          >
            Confirmar
          </button>
        </main>
      )
    }

    if (step === 2) {
      return (
        <main className="min-h-screen flex flex-col items-center justify-center gap-4 p-4">
          <p>Paso 2: Nombra tus materias</p>
          {files.map((f, i) => (
            <div key={i} className="flex gap-2 items-center">
              <span>{f.name} es de</span>
              <input
                className="border p-1"
                value={subjects[i]}
                onChange={(e) => {
                  const arr = [...subjects]
                  arr[i] = e.target.value
                  setSubjects(arr)
                }}
              />
            </div>
          ))}
          <button
            onClick={async () => {
              let max = 0
              for (const file of files) {
                const data = await file.arrayBuffer()
                const wb = XLSX.read(data, { type: "array" })
                const sheet = wb.Sheets[wb.SheetNames[0]]
                const rows: Record<string, any>[] = XLSX.utils.sheet_to_json(sheet)
                for (const row of rows) {
                  const n = parseInt(row["SEMANA"])
                  if (!isNaN(n) && n > max) max = n
                }
              }
              if (max === 0) max = 1
              setMaxWeeks(max)
              localStorage.setItem("maxWeeks", String(max))
              setTheoryDays(new Array(files.length).fill(""))
              setPracticeDays(new Array(files.length).fill(""))
              setStep(3)
            }}
            className="border px-3 py-1"
          >
            Confirmar
          </button>
        </main>
      )
    }

    if (step === 3) {
      return (
        <main className="min-h-screen flex flex-col items-center justify-center gap-4 p-4">
          <p>Paso 3: Asigna días de teoría y práctica</p>
          {subjects.map((name, i) => (
            <div key={i} className="flex gap-2 items-center">
              <span>{name}</span>
              <select
                className="border p-1"
                value={theoryDays[i]}
                onChange={(e) => {
                  const arr = [...theoryDays]
                  arr[i] = e.target.value
                  setTheoryDays(arr)
                }}
              >
                <option value="">Teoría</option>
                {DAYS.map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </select>
              <select
                className="border p-1"
                value={practiceDays[i]}
                onChange={(e) => {
                  const arr = [...practiceDays]
                  arr[i] = e.target.value
                  setPracticeDays(arr)
                }}
              >
                <option value="">Práctica</option>
                {DAYS.map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </select>
            </div>
          ))}
          <button onClick={() => setStep(4)} className="border px-3 py-1">
            Confirmar
          </button>
        </main>
      )
    }

    if (step === 4) {
      return (
        <main className="min-h-screen flex flex-col items-center justify-center gap-4 p-4">
          <p>Paso 4: Da acceso a la carpeta "gestor"</p>
          <input type="file" webkitdirectory="true" directory="" onChange={() => {}} />
          <button onClick={() => setStep(5)} className="border px-3 py-1">
            Confirmar
          </button>
        </main>
      )
    }

    if (step === 5) {
      return (
        <main className="min-h-screen flex flex-col items-center justify-center gap-4 p-4">
          <p>Paso 5: ¡Listo! Presiona continuar para finalizar.</p>
          <button
            onClick={() => {
              localStorage.setItem("setupComplete", "1")
              setSetupComplete(true)
              setStarted(false)
            }}
            className="border px-3 py-1"
          >
            Finalizar
          </button>
        </main>
      )
    }
  }

  const weeks = Array.from({ length: maxWeeks }, (_, i) => i + 1)

  return (
    <main className="grid grid-cols-2 min-h-screen">
      <aside className="border-r p-4 space-y-2">
        <h2 className="text-xl">Semanas</h2>
        <ul className="space-y-1">
          {weeks.map((w, i) => (
            <li key={w} className={i === 0 ? "font-bold" : "opacity-50"}>
              Semana {w}
              {i > 0 ? " 🔒" : ""}
            </li>
          ))}
        </ul>
      </aside>
      <section>
        <iframe
          title="Visor PDF avanzado"
          src="/visor/index.html"
          className="w-full h-screen border-0"
        />
      </section>
    </main>
  )
}
