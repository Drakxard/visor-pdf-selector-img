"use client"

import { useEffect, useState, ChangeEvent } from "react"
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
  const [tree, setTree] = useState<Record<number, Record<string, string[]>>>({})
  const [pdfMap, setPdfMap] = useState<Record<string, { file: File; week: number; subject: string }>>({})
  const [currentPdf, setCurrentPdf] = useState<{
    path: string
    url: string
    name: string
    subject: string
  } | null>(null)
  const [completed, setCompleted] = useState<Record<string, boolean>>({})
  const [history, setHistory] = useState<string[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const [explorer, setExplorer] = useState<{ week?: number; subject?: string }>({})

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

  const openPdf = (path: string, push = true) => {
    const entry = pdfMap[path]
    if (!entry) return
    const url = URL.createObjectURL(entry.file)
    setCurrentPdf({ path, url, name: entry.file.name, subject: entry.subject })
    if (push) {
      setHistory((h) => [...h.slice(0, historyIndex + 1), path])
      setHistoryIndex((i) => i + 1)
    }
  }

  const computeRanking = () => {
    const counts: Record<string, number> = {}
    Object.keys(pdfMap).forEach((k) => {
      if (!completed[k]) {
        const subj = pdfMap[k].subject
        counts[subj] = (counts[subj] || 0) + 1
      }
    })
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([s]) => s)
  }

  const nextPdf = () => {
    const ranking = computeRanking()
    for (const subj of ranking) {
      const candidates = Object.keys(pdfMap)
        .filter((k) => pdfMap[k].subject === subj)
        .sort((a, b) => {
          const aw = pdfMap[a].week
          const bw = pdfMap[b].week
          if (aw === bw) return pdfMap[a].file.name.localeCompare(pdfMap[b].file.name)
          return aw - bw
        })
      for (const path of candidates) {
        if (!completed[path]) {
          openPdf(path)
          return
        }
      }
    }
    setCurrentPdf(null)
  }

  const prevPdf = () => {
    if (historyIndex > 0) {
      const path = history[historyIndex - 1]
      openPdf(path, false)
      setHistoryIndex(historyIndex - 1)
    }
  }

  const toggleComplete = () => {
    if (!currentPdf) return
    const path = currentPdf.path
    const now = !completed[path]
    setCompleted({ ...completed, [path]: now })
    if (now) nextPdf()
  }

  useEffect(() => {
    if (setupComplete && !currentPdf && Object.keys(pdfMap).length) {
      nextPdf()
    }
  }, [setupComplete, pdfMap])

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
        const handleFolder = (e: ChangeEvent<HTMLInputElement>) => {
          const list = Array.from(e.target.files || [])
          const t: Record<number, Record<string, string[]>> = {}
          const map: Record<string, { file: File; week: number; subject: string }> = {}
          list.forEach((f) => {
            const parts = f.webkitRelativePath.split("/")
            if (parts.length >= 4) {
              const subject = parts[1]
              const weekStr = parts[2]
              const weekNum = parseInt(weekStr.replace("sem", ""))
              const key = `${weekNum}/${subject}/${f.name}`
              if (!t[weekNum]) t[weekNum] = {}
              if (!t[weekNum][subject]) t[weekNum][subject] = []
              t[weekNum][subject].push(key)
              map[key] = { file: f, week: weekNum, subject }
            }
          })
          setTree(t)
          setPdfMap(map)
          setFolderReady(list.length > 0)
        }
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
              onChange={handleFolder}
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
        {explorer.week === undefined ? (
          <>
            <h2 className="text-xl">Semanas</h2>
            <ul className="space-y-1">
              {Object.keys(tree)
                .sort((a, b) => Number(a) - Number(b))
                .map((w) => (
                  <li key={w}>
                    <button
                      className="hover:underline"
                      onClick={() => setExplorer({ week: Number(w) })}
                    >
                      Semana {w}
                    </button>
                  </li>
                ))}
            </ul>
          </>
        ) : explorer.subject === undefined ? (
          <>
            <button className="mb-2 underline" onClick={() => setExplorer({})}>
              ← Atrás
            </button>
            <h2 className="text-xl">Materias</h2>
            <ul className="space-y-1">
              {Object.keys(tree[explorer.week])?.map((s) => (
                <li key={s}>
                  <button
                    className="hover:underline"
                    onClick={() => setExplorer({ week: explorer.week, subject: s })}
                  >
                    {s}
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <>
            <button
              className="mb-2 underline"
              onClick={() => setExplorer({ week: explorer.week })}
            >
              ← Atrás
            </button>
            <h2 className="text-xl">{explorer.subject}</h2>
            <ul className="space-y-1">
              {tree[explorer.week][explorer.subject].map((path) => (
                <li key={path}>
                  <button className="hover:underline" onClick={() => openPdf(path)}>
                    {pdfMap[path].file.name}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </aside>
      <section className="flex flex-col h-screen">
        {currentPdf ? (
          <>
            <div className="flex items-center justify-between p-2 border-b">
              <span className="flex items-center gap-2">
                📄 {currentPdf.name}
              </span>
              <div className="flex items-center gap-2">
                <button onClick={toggleComplete} title="Marcar completado">
                  {completed[currentPdf.path] ? "✅" : "☐"}
                </button>
                <button onClick={prevPdf} title="Anterior">
                  ←
                </button>
                <button onClick={nextPdf} title="Siguiente">
                  →
                </button>
              </div>
            </div>
            <iframe
              key={currentPdf.url}
              title="Visor PDF"
              src={`/visor/index.html?file=${encodeURIComponent(currentPdf.url)}&name=${encodeURIComponent(currentPdf.name)}`}
              className="w-full flex-1 border-0"
            />
          </>
        ) : (
          <div className="h-full flex items-center justify-center">
            No hay PDF seleccionado
          </div>
        )}
      </section>
    </main>
  )
}

