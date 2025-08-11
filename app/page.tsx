"use client"

import { useEffect, useState, useRef } from "react"
import { useTheme } from "next-themes"
import * as XLSX from "xlsx"

const days = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"]
const dayMap: Record<string, number> = {
  Lunes: 1,
  Martes: 2,
  Miércoles: 3,
  Jueves: 4,
  Viernes: 5,
}

type PdfFile = {
  path: string
  name: string
  week: number
  subject: string
  pages?: number
  kind?: "teoria" | "practica" | null
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
  const [weeks, setWeeks] = useState(1)
  const [fileTree, setFileTree] = useState<Record<number, Record<string, PdfFile[]>>>({})
  const [completed, setCompleted] = useState<Record<string, boolean>>({})
  const [pdfMeta, setPdfMeta] = useState<
    Record<
      string,
      { kind?: "teoria" | "practica" | null; order: number; pages?: number; lastPage?: number }
    >
  >({})
  const [subjectColors, setSubjectColors] = useState<Record<string, string>>({})
  const [currentPdf, setCurrentPdf] = useState<PdfFile | null>(null)
  const [queue, setQueue] = useState<PdfFile[]>([])
  const [queueIndex, setQueueIndex] = useState(0)
  const [viewWeek, setViewWeek] = useState<number | null>(null)
  const [viewSubject, setViewSubject] = useState<string | null>(null)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [showSchedule, setShowSchedule] = useState(false)
  const [scheduleFilter, setScheduleFilter] = useState<string>("all")
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const [lastOpened, setLastOpened] = useState<string | null>(null)
  const colorPickers = useRef<Record<string, HTMLInputElement | null>>({})

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
    const storedNames = localStorage.getItem("names")
    if (storedNames) setNames(JSON.parse(storedNames))
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

  // persist completed
  useEffect(() => {
    localStorage.setItem("completed", JSON.stringify(completed))
  }, [completed])

  // load pdf meta
  useEffect(() => {
    const stored = localStorage.getItem("pdfMeta")
    if (stored) setPdfMeta(JSON.parse(stored))
  }, [])

  // persist pdf meta
  useEffect(() => {
    localStorage.setItem("pdfMeta", JSON.stringify(pdfMeta))
  }, [pdfMeta])

  // load additional settings
  useEffect(() => {
    const s = localStorage.getItem("subjectColors")
    if (s) setSubjectColors(JSON.parse(s))
    const t = localStorage.getItem("theory")
    if (t) setTheory(JSON.parse(t))
    const p = localStorage.getItem("practice")
    if (p) setPractice(JSON.parse(p))
    const lo = localStorage.getItem("lastOpened")
    if (lo) setLastOpened(lo)
    fetch("/api/config")
      .then((r) => r.json())
      .then((cfg) => {
        if (cfg.subjectColors) setSubjectColors(cfg.subjectColors)
        if (cfg.theory) setTheory(cfg.theory)
        if (cfg.practice) setPractice(cfg.practice)
        if (cfg.pdfMeta) setPdfMeta(cfg.pdfMeta)
        if (cfg.completed) setCompleted(cfg.completed)
        if (cfg.lastOpened) setLastOpened(cfg.lastOpened)
        if (cfg.names) setNames(cfg.names)
        if (cfg.weeks) setWeeks(cfg.weeks)
        if (cfg.setupComplete !== undefined) setSetupComplete(cfg.setupComplete)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    localStorage.setItem("subjectColors", JSON.stringify(subjectColors))
  }, [subjectColors])
  useEffect(() => {
    localStorage.setItem("theory", JSON.stringify(theory))
  }, [theory])
  useEffect(() => {
    localStorage.setItem("practice", JSON.stringify(practice))
  }, [practice])
  useEffect(() => {
    if (lastOpened) localStorage.setItem("lastOpened", lastOpened)
  }, [lastOpened])
  useEffect(() => {
    localStorage.setItem("names", JSON.stringify(names))
  }, [names])
  
  useEffect(() => {
    const body = {
      pdfMeta,
      completed,
      subjectColors,
      theory,
      practice,
      lastOpened,
      names,
      weeks,
      setupComplete,
    }
    fetch("/api/config", { method: "POST", body: JSON.stringify(body) })
  }, [pdfMeta, completed, subjectColors, theory, practice, lastOpened, names, weeks, setupComplete])

  // load file tree from server
  useEffect(() => {
    if (!setupComplete) return
    const load = async () => {
      const res = await fetch("/api/files")
      const data: Record<number, Record<string, { path: string; name: string; pages: number }[]>> = await res.json()
      const tree: Record<number, Record<string, PdfFile[]>> = {}
      const meta = { ...pdfMeta }
      let auto = 0
      for (const w in data) {
        const week = Number(w)
        tree[week] = {}
        for (const s in data[w]) {
          if (!names.includes(s)) continue
          tree[week][s] = data[w][s].map((p) => {
            const m = meta[p.path] || { order: auto++ }
            m.pages = p.pages
            meta[p.path] = m
            return { path: p.path, name: p.name, week, subject: s, pages: p.pages, kind: m.kind || null }
          }).sort((a, b) => (meta[a.path]?.order ?? 0) - (meta[b.path]?.order ?? 0))
        }
      }
      setPdfMeta(meta)
      setFileTree(tree)
    }
    load()
  }, [setupComplete, names])

  // update tree when metadata changes (order or labels)
  useEffect(() => {
    setFileTree((prev) => {
      const copy: Record<number, Record<string, PdfFile[]>> = {}
      for (const w in prev) {
        copy[w] = {}
        for (const s in prev[w]) {
          copy[w][s] = [...prev[w][s]].sort(
            (a, b) => (pdfMeta[a.path]?.order ?? 0) - (pdfMeta[b.path]?.order ?? 0),
          )
          copy[w][s].forEach((p) => {
            p.kind = pdfMeta[p.path]?.kind || null
            p.pages = pdfMeta[p.path]?.pages
          })
        }
      }
      return copy
    })
  }, [pdfMeta])

  // compute queue ordered by urgency
  useEffect(() => {
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
        ...s.pdfs.sort((a, b) => a.week - b.week || a.name.localeCompare(b.name)),
      )
    })
    setQueue(q)
    if (q.length) {
      const current = currentPdf && q.find((f) => f.path === currentPdf.path)
      const last = lastOpened ? q.find((f) => f.path === lastOpened) : null
      const target = current || last || q[0]
      setCurrentPdf(target)
      setQueueIndex(q.findIndex((f) => f.path === target.path))
    } else {
      setCurrentPdf(null)
      setQueueIndex(0)
    }
  }, [fileTree, completed, theory, practice, lastOpened])

  // viewer url
  useEffect(() => {
    if (currentPdf) {
      setPdfUrl(`/api/pdf?path=${encodeURIComponent(currentPdf.path)}`)
    } else {
      setPdfUrl(null)
    }
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
              onClick={() => {
                const palette = [
                  "bg-red-500",
                  "bg-green-500",
                  "bg-blue-500",
                  "bg-purple-500",
                  "bg-pink-500",
                  "bg-yellow-500",
                ]
                const colors: Record<string, string> = {}
                names.forEach((n, i) => (colors[n] = palette[i % palette.length]))
                setSubjectColors(colors)
                setStep(3)
              }}
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
            <p>Se utilizará la carpeta preconfigurada.</p>
            <button className="px-4 py-2 border rounded" onClick={finish}>
              Finalizar
            </button>
          </main>
        )
      }
    }
  }

  const handleSelectPdf = (pdf: PdfFile) => {
    const idx = queue.findIndex((f) => f.path === pdf.path)
    if (idx >= 0) {
      setQueueIndex(idx)
      setCurrentPdf(queue[idx])
    } else {
      setCurrentPdf(pdf)
    }
    setLastOpened(pdf.path)
  }

  const prevPdf = () => {
    if (queueIndex > 0) {
      const i = queueIndex - 1
      setQueueIndex(i)
      setCurrentPdf(queue[i])
      setLastOpened(queue[i].path)
    }
  }

  const nextPdf = () => {
    if (queueIndex < queue.length - 1) {
      const i = queueIndex + 1
      setQueueIndex(i)
      setCurrentPdf(queue[i])
      setLastOpened(queue[i].path)
    }
  }

  const toggleComplete = () => {
    if (!currentPdf) return
    const key = currentPdf.path
    setCompleted((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const updateKind = (path: string, kind: "teoria" | "practica") => {
    setPdfMeta((prev) => ({
      ...prev,
      [path]: { ...(prev[path] || { order: Object.keys(prev).length }), kind },
    }))
  }

  const movePdf = (week: number, subject: string, path: string, dir: number) => {
    setPdfMeta((prev) => {
      const next = { ...prev }
      const files = fileTree[week]?.[subject] || []
      const sorted = [...files].sort(
        (a, b) => (prev[a.path]?.order ?? 0) - (prev[b.path]?.order ?? 0),
      )
      const idx = sorted.findIndex((p) => p.path === path)
      const swap = sorted[idx + dir]
      if (!swap) return prev
      const curOrder = next[path]?.order ?? 0
      const swapOrder = next[swap.path]?.order ?? 0
      next[path] = { ...(next[path] || {}), order: swapOrder }
      next[swap.path] = { ...(next[swap.path] || {}), order: curOrder }
      return next
    })
  }

  const openFull = () => {
    if (!currentPdf || !pdfUrl) return
    const page = pdfMeta[currentPdf.path]?.lastPage || 1
    const params = new URLSearchParams({
      url: pdfUrl,
      name: currentPdf.name,
      path: currentPdf.path,
      page: String(page),
    })
    window.location.href = `/visor/index.html?${params.toString()}`
  }

  const computeRemaining = (pdf: PdfFile) => {
    const meta = pdfMeta[pdf.path]
    const schedule = meta?.kind === "practica" ? practice[pdf.subject] : theory[pdf.subject]
    if (!schedule) return null
    const today = new Date().getDay()
    let diff = dayMap[schedule] - today
    if (diff <= 0) diff += 7
    return diff
  }

  // main interface
  const remaining = currentPdf ? computeRemaining(currentPdf) : null
  return (
    <main className="min-h-screen relative">
      <div className="p-4">
        <button
          className="underline"
          onClick={() => {
            setShowSchedule((s) => !s)
            setSelectedDay(null)
          }}
        >
          {showSchedule ? "Ocultar cronograma" : "Ver cronograma"}
        </button>
        {showSchedule && (
          <div className="mt-4 space-y-4">
            <div className="flex gap-2 items-center">
              <div key="all">
                <button
                  className={`w-6 h-6 rounded-full border ${
                    scheduleFilter === 'all' ? 'ring-2 ring-black' : ''
                  }`}
                  style={{ backgroundColor: '#9ca3af' }}
                  onClick={() => {
                    setScheduleFilter('all')
                    setSelectedDay(null)
                  }}
                />
              </div>
              {names.map((n) => (
                <div key={n} className="relative">
                  <button
                    className={`w-6 h-6 rounded-full border ${
                      scheduleFilter === n ? "ring-2 ring-black" : ""
                    }`}
                    style={{ backgroundColor: subjectColors[n] || "#9ca3af" }}
                    onClick={() => {
                      setScheduleFilter(scheduleFilter === n ? "all" : n)
                      setSelectedDay(null)
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault()
                      colorPickers.current[n]?.click()
                    }}
                  />
                  <input
                    type="color"
                    ref={(el) => (colorPickers.current[n] = el)}
                    className="hidden"
                    value={subjectColors[n] || "#9ca3af"}
                    onChange={(e) =>
                      setSubjectColors((prev) => ({ ...prev, [n]: e.target.value }))
                    }
                  />
                </div>
              ))}
            </div>
            <div className="flex gap-4">
              {days.map((d) => (
                <div
                  key={d}
                  className="flex-1 border p-2 cursor-pointer"
                  onClick={() => setSelectedDay(d)}
                >
                  <div className="font-bold mb-2">{d}</div>
                  <div className="flex flex-wrap gap-1">
                    {names
                      .filter((n) => scheduleFilter === "all" || scheduleFilter === n)
                      .map((n) => {
                        const isT = theory[n] === d
                        const isP = practice[n] === d
                        if (!isT && !isP) return null
                        const color = subjectColors[n] || "#9ca3af"
                        const label = isT && isP ? "T/P" : isT ? "T" : "P"
                        return (
                          <div
                            key={n}
                            className="w-6 h-6 rounded-full text-white text-xs flex items-center justify-center"
                            style={{ backgroundColor: color }}
                            title={`${n} ${label}`}
                          >
                            {label[0]}
                          </div>
                        )
                      })}
                  </div>
                </div>
              ))}
            </div>
            {selectedDay && (
              <div className="mt-2">
                {(scheduleFilter === "all" ? names : [scheduleFilter]).map((subj) => {
                  const list: PdfFile[] = []
                  Object.values(fileTree).forEach((weeks) => {
                    const files = weeks[subj] || []
                    files.forEach((p) => {
                      const meta = pdfMeta[p.path]
                      const sched =
                        (meta?.kind === "practica" ? practice[subj] : theory[subj]) || null
                      if (sched === selectedDay && !completed[p.path]) {
                        list.push(p)
                      }
                    })
                  })
                  if (!list.length) return null
                  return (
                    <div key={subj} className="mb-2">
                      <div className="font-semibold">{subj}</div>
                      <ul className="list-disc ml-4">
                        {list.map((p) => (
                          <li
                            key={p.path}
                            className="cursor-pointer underline"
                            onClick={() => handleSelectPdf(p)}
                          >
                            {p.name}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 min-h-screen">
        <aside className="border-r p-4 space-y-2">
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
                  const theoryFiles = (fileTree[viewWeek]?.[s] || []).filter(
                    (p) => pdfMeta[p.path]?.kind === "teoria",
                  )
                  const total = theoryFiles.reduce(
                    (sum, p) => sum + (pdfMeta[p.path]?.pages || 0),
                    0,
                  )
                  const done = theoryFiles
                    .filter((p) => completed[p.path])
                    .reduce((sum, p) => sum + (pdfMeta[p.path]?.pages || 0), 0)
                  const pct = total ? Math.round((done / total) * 100) : 0
                  return (
                    <li key={s} className="flex justify-between items-center">
                      <button onClick={() => setViewSubject(s)}>{s}</button>
                      <span className="text-sm text-gray-500">{pct}% teoría</span>
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
                {(fileTree[viewWeek]?.[viewSubject] || []).map((p) => (
                  <li
                    key={p.path}
                    className={`flex items-center gap-2 ${
                      completed[p.path] ? "line-through text-gray-400" : ""
                    }`}
                  >
                    <span
                      className="flex-1 cursor-pointer"
                      onClick={() => handleSelectPdf(p)}
                      title={p.name}
                    >
                      {p.name}
                    </span>
                    <select
                      className="border text-xs"
                      value={pdfMeta[p.path]?.kind || ""}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) =>
                        updateKind(
                          p.path,
                          e.target.value as "teoria" | "practica",
                        )
                      }
                    >
                      <option value="">-</option>
                      <option value="teoria">T</option>
                      <option value="practica">P</option>
                    </select>
                    <div className="flex flex-col">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          movePdf(p.week, p.subject, p.path, -1)
                        }}
                      >
                        ↑
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          movePdf(p.week, p.subject, p.path, 1)
                        }}
                      >
                        ↓
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </aside>
        <section className="p-4 flex flex-col">
          <h2 className="text-xl mb-2">Actual</h2>
          {currentPdf ? (
            <>
              <div className="flex items-center gap-2 mb-2">
                <button onClick={prevPdf} disabled={queueIndex <= 0}>←</button>
                <button onClick={nextPdf} disabled={queueIndex >= queue.length - 1}>→</button>
                <span>📄</span>
                <span className="truncate flex-1" title={currentPdf.name}>
                  {currentPdf.name}
                </span>
                <input
                  type="checkbox"
                  checked={!!completed[currentPdf.path]}
                  onChange={toggleComplete}
                />
              </div>
              <div className="flex-1 border cursor-pointer" onClick={openFull}>
                <iframe
                  title="Visor PDF avanzado"
                  src={
                    pdfUrl
                      ? `/visor/index.html?url=${encodeURIComponent(pdfUrl)}&name=${encodeURIComponent(
                          currentPdf.name,
                        )}&path=${encodeURIComponent(currentPdf.path)}&page=${
                          pdfMeta[currentPdf.path]?.lastPage || 1
                        }`
                      : "/visor/index.html"
                  }
                  className="w-full h-full border-0 pointer-events-none"
                />
              </div>
              {remaining !== null && (
                <div
                  className={`p-2 text-center ${
                    remaining >= 3
                      ? "text-green-500"
                      : remaining === 2
                      ? "text-yellow-500"
                      : "text-red-500"
                  }`}
                >
                  Días restantes: {remaining}
                </div>
              )}
            </>
          ) : (
            <p>Sin selección</p>
          )}
        </section>
      </div>
    </main>
  )
}

