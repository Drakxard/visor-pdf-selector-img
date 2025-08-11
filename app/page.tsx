"use client"

import { useEffect, useState } from "react"
import { useTheme } from "next-themes"
import * as XLSX from "xlsx"

const days = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"]

type PdfFile = {
  file: File
  path: string
  week: number
  subject: string
  type: "teoria" | "practica" | null
}

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
  const [dirFiles, setDirFiles] = useState<File[]>([])
  const [fileTree, setFileTree] = useState<Record<number, Record<string, PdfFile[]>>>({})
  const [completed, setCompleted] = useState<Record<string, boolean>>({})
  const [tags, setTags] = useState<Record<string, "teoria" | "practica">>({})
  const [currentPdf, setCurrentPdf] = useState<PdfFile | null>(null)
  const [queue, setQueue] = useState<PdfFile[]>([])
  const [queueIndex, setQueueIndex] = useState(0)
  const [viewWeek, setViewWeek] = useState<number | null>(null)
  const [viewSubject, setViewSubject] = useState<string | null>(null)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [viewerOpen, setViewerOpen] = useState(false)
  const [showSchedule, setShowSchedule] = useState(false)
  const [scheduleFilter, setScheduleFilter] = useState<string>("")
  const [selectedDay, setSelectedDay] = useState<string>("")

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
      const storedNames = localStorage.getItem("names")
      if (storedNames) setNames(JSON.parse(storedNames))
      const storedTheory = localStorage.getItem("theory")
      if (storedTheory) setTheory(JSON.parse(storedTheory))
      const storedPractice = localStorage.getItem("practice")
      if (storedPractice) setPractice(JSON.parse(storedPractice))
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

  // load completed from storage
  useEffect(() => {
    const stored = localStorage.getItem("completed")
    if (stored) setCompleted(JSON.parse(stored))
  }, [])

  // load tags
  useEffect(() => {
    const stored = localStorage.getItem("tags")
    if (stored) setTags(JSON.parse(stored))
  }, [])

  // persist completed
  useEffect(() => {
    localStorage.setItem("completed", JSON.stringify(completed))
  }, [completed])

  useEffect(() => {
    localStorage.setItem("tags", JSON.stringify(tags))
  }, [tags])

  // build tree from selected directory
  useEffect(() => {
    const tree: Record<number, Record<string, PdfFile[]>> = {}
    for (const file of dirFiles) {
      const parts = (file as any).webkitRelativePath?.split("/") || []
      if (parts.length >= 3 && file.name.toLowerCase().endsWith(".pdf")) {
        const weekMatch = parts[0].match(/\d+/)
        const week = weekMatch ? parseInt(weekMatch[0]) : 1
        const subject = parts[1]
        if (!tree[week]) tree[week] = {}
        if (!tree[week][subject]) tree[week][subject] = []
        const key = parts.join("/")
        tree[week][subject].push({
          file,
          path: key,
          week,
          subject,
          type: tags[key] || null,
        })
      }
    }
    for (const w in tree) {
      for (const s in tree[w]) {
        tree[w][s].sort((a, b) => a.file.name.localeCompare(b.file.name))
      }
    }
    setFileTree(tree)
  }, [dirFiles, tags])

  // compute queue ordered by urgency
  useEffect(() => {
    const dayMap: Record<string, number> = {
      Lunes: 1,
      Martes: 2,
      Miércoles: 3,
      Jueves: 4,
      Viernes: 5,
    }
    const today = new Date().getDay()
    const stats: { subject: string; days: number; pdfs: PdfFile[] }[] = []
    Object.values(fileTree).forEach((subjects) => {
      Object.entries(subjects).forEach(([subject, files]) => {
        const remaining = files.filter((f) => !completed[f.path])
        if (!remaining.length) return
        let days = 7
        const t = theory[subject]
        const p = practice[subject]
        const candidates = [t, p]
          .filter((d): d is string => !!d)
          .map((d) => dayMap[d])
        if (candidates.length) {
          days = Math.min(
            ...candidates.map((d) => {
              let diff = d - today
              if (diff < 0) diff += 7
              if (diff === 0) diff = 7
              return diff
            }),
          )
        }
        stats.push({ subject, days, pdfs: remaining })
      })
    })
    stats.sort((a, b) => {
      if (a.days !== b.days) return a.days - b.days
      return b.pdfs.length - a.pdfs.length
    })
    const q: PdfFile[] = []
    stats.forEach((s) => {
      q.push(
        ...s.pdfs.sort((a, b) => a.week - b.week || a.file.name.localeCompare(b.file.name)),
      )
    })
    setQueue(q)
    if (q.length) {
      const current = currentPdf && q.find((f) => f.path === currentPdf.path)
      const target = current || q[0]
      setCurrentPdf(target)
      setQueueIndex(q.findIndex((f) => f.path === target.path))
    } else {
      setCurrentPdf(null)
      setQueueIndex(0)
    }
  }, [fileTree, completed, theory, practice])

  // object url for viewer
  useEffect(() => {
    if (currentPdf) {
      const url = URL.createObjectURL(currentPdf.file)
      setPdfUrl(url)
      return () => URL.revokeObjectURL(url)
    }
    setPdfUrl(null)
  }, [currentPdf])

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
          localStorage.setItem("names", JSON.stringify(names))
          localStorage.setItem("theory", JSON.stringify(theory))
          localStorage.setItem("practice", JSON.stringify(practice))
          setSetupComplete(true)
          setStarted(false)
        }
        return (
          <main className="min-h-screen flex flex-col items-center justify-center gap-4 p-4">
            <p>Paso 4: Da acceso a la carpeta "gestor"</p>
            <input
              type="file"
              // @ts-expect-error webkitdirectory es no estándar
              webkitdirectory=""
              onChange={(e) => {
                setDirFiles(Array.from(e.target.files || []))
                setFolderReady(true)
              }}
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

  const handleSelectPdf = (pdf: PdfFile) => {
    let tagged = tags[pdf.path]
    if (!tagged) {
      const t = window.prompt("Etiqueta para PDF (teoria/practica)", "teoria")
      if (t && t.toLowerCase().startsWith("p")) tagged = "practica"
      else tagged = "teoria"
      setTags((prev) => ({ ...prev, [pdf.path]: tagged! }))
    }
    pdf.type = tagged || null
    const idx = queue.findIndex((f) => f.path === pdf.path)
    if (idx >= 0) {
      setQueueIndex(idx)
      setCurrentPdf(queue[idx])
    } else {
      setCurrentPdf(pdf)
    }
    setViewerOpen(true)
  }

  const getDaysRemaining = (pdf: PdfFile) => {
    const dayMap: Record<string, number> = {
      Lunes: 1,
      Martes: 2,
      Miércoles: 3,
      Jueves: 4,
      Viernes: 5,
    }
    const today = new Date().getDay()
    const targetName =
      pdf.type === "practica" ? practice[pdf.subject] : theory[pdf.subject]
    if (!targetName) return null
    let diff = dayMap[targetName] - today
    if (diff <= 0) diff += 7
    return diff
  }

  const prevPdf = () => {
    if (queueIndex > 0) {
      const i = queueIndex - 1
      setQueueIndex(i)
      setCurrentPdf(queue[i])
    }
  }

  const nextPdf = () => {
    if (queueIndex < queue.length - 1) {
      const i = queueIndex + 1
      setQueueIndex(i)
      setCurrentPdf(queue[i])
    }
  }

  const movePdf = (week: number, subject: string, index: number, dir: number) => {
    setFileTree((prev) => {
      const copy = { ...prev }
      const arr = [...(copy[week]?.[subject] || [])]
      const newIdx = index + dir
      if (newIdx < 0 || newIdx >= arr.length) return prev
      const [item] = arr.splice(index, 1)
      arr.splice(newIdx, 0, item)
      copy[week][subject] = arr
      return { ...copy }
    })
  }

  const toggleComplete = () => {
    if (!currentPdf) return
    const key = currentPdf.path
    setCompleted((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  // main interface
  return (
    <main className="grid grid-cols-2 min-h-screen">
      <aside className="border-r p-4 space-y-2 overflow-y-auto">
        <button
          className="underline"
          onClick={() => setShowSchedule((s) => !s)}
        >
          {showSchedule ? "Ocultar cronograma" : "Ver cronograma"}
        </button>
        {showSchedule && (
          <div className="mb-4">
            <select
              className="border p-1 mb-2"
              value={scheduleFilter}
              onChange={(e) => setScheduleFilter(e.target.value)}
            >
              <option value="">Todas</option>
              {names.map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
            <div className="space-y-2">
              {days.map((d) => (
                <div key={d}>
                  <div className="font-bold">{d}</div>
                  <div className="flex flex-wrap gap-2">
                    {names
                      .filter(
                        (n) =>
                          (!scheduleFilter || scheduleFilter === n) &&
                          (theory[n] === d || practice[n] === d),
                      )
                      .map((n) => {
                        const colorIdx = names.indexOf(n)
                        return (
                          <span
                            key={n}
                            className="px-2 py-1 text-white rounded-full text-sm"
                            style={{
                              backgroundColor: [
                                "#f87171",
                                "#60a5fa",
                                "#34d399",
                                "#fbbf24",
                                "#c084fc",
                              ][colorIdx % 5],
                            }}
                          >
                            {n}
                          </span>
                        )
                      })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {!viewWeek && (
          <>
            <h2 className="text-xl">Semanas</h2>
            <ul className="space-y-1">
              {Array.from({ length: weeks }, (_, i) => {
                const wk = i + 1
                const locked = wk > 1
                return (
                  <li key={wk} className={locked ? "opacity-50" : "font-bold"}>
                    {locked ? (
                      <>Semana {wk} 🔒</>
                    ) : (
                      <button onClick={() => setViewWeek(wk)}>Semana {wk}</button>
                    )}
                  </li>
                )
              })}
            </ul>
          </>
        )}
        {viewWeek && !viewSubject && (
          <>
            <button className="mb-2 underline" onClick={() => setViewWeek(null)}>
              ← Volver
            </button>
            <h2 className="text-xl">Semana {viewWeek}</h2>
            <ul className="space-y-1">
              {Object.keys(fileTree[viewWeek] || {}).map((s) => {
                const files = fileTree[viewWeek]?.[s] || []
                const done = files.filter((f) => completed[f.path]).length
                const percent = files.length
                  ? Math.round((done / files.length) * 100)
                  : 0
                return (
                  <li key={s}>
                    <button onClick={() => setViewSubject(s)}>
                      {s} ({percent}%)
                    </button>
                  </li>
                )
              })}
            </ul>
          </>
        )}
        {viewWeek && viewSubject && (
          <>
            <button className="mb-2 underline" onClick={() => setViewSubject(null)}>
              ← Volver
            </button>
            <h2 className="text-xl">{viewSubject}</h2>
            <ul className="space-y-1">
              {(fileTree[viewWeek]?.[viewSubject] || []).map((p, i) => (
                <li
                  key={p.path}
                  className={`flex items-center gap-2 cursor-pointer ${
                    completed[p.path] ? "line-through text-gray-400" : ""
                  }`}
                >
                  <span
                    className="flex-1 truncate"
                    title={p.file.name}
                    onClick={() => handleSelectPdf(p)}
                  >
                    {p.file.name}
                  </span>
                  <button onClick={() => movePdf(viewWeek!, viewSubject!, i, -1)}>
                    ↑
                  </button>
                  <button onClick={() => movePdf(viewWeek!, viewSubject!, i, 1)}>
                    ↓
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </aside>
      <section className="flex flex-col h-screen">
        <div className="flex items-center justify-between p-2 border-b">
          <div className="flex items-center gap-2">
            <span>📄</span>
            <span className="truncate max-w-xs" title={currentPdf?.file.name}>
              {currentPdf ? currentPdf.file.name : "Sin selección"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={prevPdf} disabled={queueIndex <= 0}>
              ←
            </button>
            <button onClick={nextPdf} disabled={queueIndex >= queue.length - 1}>
              →
            </button>
            {currentPdf && (
              <input
                type="checkbox"
                checked={!!completed[currentPdf.path]}
                onChange={toggleComplete}
              />
            )}
          </div>
        </div>
        <div className="flex-1 flex flex-col">
          {/* Listado por día */}
          <div className="p-2 flex gap-2 border-b">
            <select
              className="border p-1"
              value={selectedDay}
              onChange={(e) => setSelectedDay(e.target.value)}
            >
              <option value="">Día</option>
              {days.map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
            <select
              className="border p-1"
              value={scheduleFilter}
              onChange={(e) => setScheduleFilter(e.target.value)}
            >
              <option value="">Materia</option>
              {names.map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </div>
          <div className="p-2 space-y-1 overflow-y-auto flex-1">
            {selectedDay &&
              (scheduleFilter
                ? [scheduleFilter]
                : names.filter(
                    (n) =>
                      theory[n] === selectedDay || practice[n] === selectedDay,
                  )
              ).map((sub) => {
                const pending = Object.values(fileTree)
                  .flatMap((subs) => subs[sub] || [])
                  .filter((p) => !completed[p.path])
                if (!pending.length) return null
                return (
                  <div key={sub} className="border p-2">
                    <div className="font-bold mb-1">{sub}</div>
                    <div>{pending[0].file.name}</div>
                  </div>
                )
              })}
          </div>
        </div>
      </section>
      {viewerOpen && currentPdf && (
        <div className="fixed inset-0 flex flex-col bg-black z-50">
          <div className="flex items-center justify-between p-2 text-white bg-gray-800">
            <button onClick={() => setViewerOpen(false)}>←</button>
            <div
              className="flex-1 text-center truncate px-2"
              title={currentPdf.file.name}
            >
              {currentPdf.file.name}
            </div>
            <div className="flex items-center gap-2">
              <button onClick={prevPdf} disabled={queueIndex <= 0}>
                ←
              </button>
              <button onClick={nextPdf} disabled={queueIndex >= queue.length - 1}>
                →
              </button>
              <input
                type="checkbox"
                checked={!!completed[currentPdf.path]}
                onChange={toggleComplete}
              />
            </div>
          </div>
          <iframe
            className="flex-1 w-full"
            title="Visor"
            src={`/visor/index.html?url=${encodeURIComponent(
              pdfUrl || "",
            )}&name=${encodeURIComponent(currentPdf.file.name)}`}
          />
          <div className="p-2 text-center text-white bg-gray-800">
            {(() => {
              const d = getDaysRemaining(currentPdf)
              return d !== null ? `Días restantes: ${d}` : ""
            })()}
          </div>
        </div>
      )}
    </main>
  )
}

