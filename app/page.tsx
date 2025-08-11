"use client"

import { useEffect, useState } from "react"
import { useTheme } from "next-themes"
import * as XLSX from "xlsx"

const days = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"]

export default function Home() {
  const { setTheme } = useTheme()
  const [started, setStarted] = useState(false)
  const [setupComplete, setSetupComplete] = useState(true)
  const [step, setStep] = useState(1)
  const [files, setFiles] = useState<File[]>([])
  const [names, setNames] = useState<string[]>([])
  const [theory, setTheory] = useState<Record<string, string>>({})
  const [practice, setPractice] = useState<Record<string, string>>({})
  const [folderReady, setFolderReady] = useState(false)
  const [weeks, setWeeks] = useState(1)

  // theme and setup flag
  useEffect(() => {
    const hour = new Date().getHours()
    if (hour >= 19 || hour < 6) {
      setTheme("dark")
    } else {
      setTheme("light")
    }
    const stored = localStorage.getItem("setupComplete")
    if (!stored) {
      setSetupComplete(false)
    } else {
      const storedWeeks = parseInt(localStorage.getItem("weeks") || "1")
      setWeeks(storedWeeks)
    }
  }, [setTheme])

  // greeting handler
  useEffect(() => {
    const handler = () => setStarted(true)
    if (!started) {
      window.addEventListener("keydown", handler)
      return () => window.removeEventListener("keydown", handler)
    }
  }, [started])

  // greeting screen
  if (!started) {
    const hour = new Date().getHours()
    const greeting = hour >= 19 || hour < 6 ? "Buenas noches" : "Buenos días"
    return (
      <main className="min-h-screen flex items-center justify-center text-2xl">
        <p>{greeting}. Presiona cualquier tecla para continuar.</p>
      </main>
    )
  }

  // configuration wizard
  if (!setupComplete) {
    switch (step) {
      case 1: {
        const handleConfirm = async () => {
          let maxWeek = 1
          for (const file of files) {
            const buffer = await file.arrayBuffer()
            const wb = XLSX.read(buffer)
            const sheet = wb.Sheets[wb.SheetNames[0]]
            const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet)
            rows.forEach((r) => {
              const w = parseInt(r["SEMANA"])
              if (!isNaN(w) && w > maxWeek) maxWeek = w
            })
          }
          setWeeks(maxWeek)
          setNames(files.map(() => ""))
          setStep(2)
        }
        return (
          <main className="min-h-screen flex flex-col items-center justify-center gap-4 p-4">
            <h1 className="text-xl">Comencemos a configurar el entorno</h1>
            <p>Paso 1: Sube tus cronogramas (excel)</p>
            <input
              type="file"
              accept=".xlsx,.xls"
              multiple
              onChange={(e) => setFiles(Array.from(e.target.files || []))}
            />
            <button
              className="px-4 py-2 border rounded"
              disabled={!files.length}
              onClick={handleConfirm}
            >
              Confirmar
            </button>
          </main>
        )
      }
      case 2: {
        const updateName = (idx: number, value: string) => {
          const next = [...names]
          next[idx] = value
          setNames(next)
        }
        return (
          <main className="min-h-screen flex flex-col items-center justify-center gap-4 p-4">
            <p>Paso 2: Nombra tus cronogramas</p>
            {files.map((f, i) => (
              <label key={i} className="flex gap-2 items-center">
                <span>{f.name} es de</span>
                <input
                  className="border p-1"
                  value={names[i] || ""}
                  onChange={(e) => updateName(i, e.target.value)}
                />
              </label>
            ))}
            <button
              className="px-4 py-2 border rounded"
              disabled={names.some((n) => !n)}
              onClick={() => setStep(3)}
            >
              Confirmar
            </button>
          </main>
        )
      }
      case 3: {
        const unassigned = names.filter((n) => !theory[n])
        const handleDrop = (subject: string, day: string) => {
          setTheory({ ...theory, [subject]: day })
        }
        return (
          <main className="min-h-screen flex flex-col items-center gap-4 p-4">
            <p>Paso 3: Arrastra tus materias (teoría) a los días</p>
            <div className="flex gap-4">
              <div className="w-40 border p-2 min-h-40">
                {unassigned.map((s) => (
                  <div
                    key={s}
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData("text", s)}
                    className="p-1 mb-2 bg-green-500 text-white cursor-move"
                  >
                    {s}
                  </div>
                ))}
              </div>
              {days.map((d) => (
                <div
                  key={d}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => handleDrop(e.dataTransfer.getData("text"), d)}
                  className="border p-2 w-32 min-h-40"
                >
                  <div className="font-bold">{d}</div>
                  {Object.entries(theory)
                    .filter(([_, day]) => day === d)
                    .map(([s]) => (
                      <div key={s} className="p-1 mt-2 bg-green-200">
                        {s}
                      </div>
                    ))}
                </div>
              ))}
            </div>
            {unassigned.length === 0 && (
              <button
                className="px-4 py-2 border rounded"
                onClick={() => {
                  setStep(4)
                }}
              >
                Confirmar
              </button>
            )}
          </main>
        )
      }
      case 4: {
        const unassigned = names.filter((n) => !practice[n])
        const handleDrop = (subject: string, day: string) => {
          setPractice({ ...practice, [subject]: day })
        }
        return (
          <main className="min-h-screen flex flex-col items-center gap-4 p-4">
            <p>Paso 3: Arrastra tus materias (práctica) a los días</p>
            <div className="flex gap-4">
              <div className="w-40 border p-2 min-h-40">
                {unassigned.map((s) => (
                  <div
                    key={s}
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData("text", s)}
                    className="p-1 mb-2 bg-blue-500 text-white cursor-move"
                  >
                    {s}
                  </div>
                ))}
              </div>
              {days.map((d) => (
                <div
                  key={d}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => handleDrop(e.dataTransfer.getData("text"), d)}
                  className="border p-2 w-32 min-h-40"
                >
                  <div className="font-bold">{d}</div>
                  {Object.entries(practice)
                    .filter(([_, day]) => day === d)
                    .map(([s]) => (
                      <div key={s} className="p-1 mt-2 bg-blue-200">
                        {s}
                      </div>
                    ))}
                </div>
              ))}
            </div>
            {unassigned.length === 0 && (
              <button
                className="px-4 py-2 border rounded"
                onClick={() => setStep(5)}
              >
                Confirmar
              </button>
            )}
          </main>
        )
      }
      case 5: {
        const finish = () => {
          localStorage.setItem("setupComplete", "1")
          localStorage.setItem("weeks", String(weeks))
          setSetupComplete(true)
          setStarted(false)
        }
        return (
          <main className="min-h-screen flex flex-col items-center justify-center gap-4 p-4">
            <p>Paso 4: Da acceso a la carpeta "gestor"</p>
            <input
              type="file"
              // @ts-expect-error webkitdirectory is non-standard
              webkitdirectory=""
              onChange={() => setFolderReady(true)}
            />
            <button
              className="px-4 py-2 border rounded"
              disabled={!folderReady}
              onClick={finish}
            >
              Finalizar
            </button>
          </main>
        )
      }
    }
  }

  // main interface
  return (
    <main className="grid grid-cols-2 min-h-screen">
      <aside className="border-r p-4 space-y-2">
        <h2 className="text-xl">Semanas</h2>
        <ul className="space-y-1">
          {Array.from({ length: weeks }, (_, i) => (
            <li key={i} className={i === 0 ? "font-bold" : "opacity-50"}>
              Semana {i + 1}
              {i > 0 && " 🔒"}
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

