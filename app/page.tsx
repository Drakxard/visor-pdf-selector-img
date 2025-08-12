"use client"

import { useEffect, useRef, useState } from "react"
import { useTheme } from "next-themes"
import * as XLSX from "xlsx"

const days = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"]

type PdfFile = {
  file: File
  path: string
  week: number
  subject: string
}

export default function Home() {
  const { setTheme } = useTheme()
  const [started, setStarted] = useState(false)
  const [setupComplete, setSetupComplete] = useState(true)
  const [step, setStep] = useState(0)
  const [files, setFiles] = useState<File[]>([])
  const [names, setNames] = useState<string[]>([])
  const [theory, setTheory] = useState<Record<string, string>>({})
  const [practice, setPractice] = useState<Record<string, string>>({})
  const [weeks, setWeeks] = useState(1)
  const [dirFiles, setDirFiles] = useState<File[]>([])
  const [fileTree, setFileTree] = useState<Record<number, Record<string, PdfFile[]>>>({})
  const [completed, setCompleted] = useState<Record<string, boolean>>({})
  const [currentPdf, setCurrentPdf] = useState<PdfFile | null>(null)
  const [queue, setQueue] = useState<PdfFile[]>([])
  const [queueIndex, setQueueIndex] = useState(0)
  const [viewWeek, setViewWeek] = useState<number | null>(null)
  const [viewSubject, setViewSubject] = useState<string | null>(null)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [labels, setLabels] = useState<Record<string, string>>({})
  const [orders, setOrders] = useState<Record<string, string[]>>({})
  const [viewerOpen, setViewerOpen] = useState(false)
  const [showSchedule, setShowSchedule] = useState(false)
  const [filterSubject, setFilterSubject] = useState<string | null>(null)
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [configFound, setConfigFound] = useState<boolean | null>(null)
  const [dayFilter, setDayFilter] = useState<string | null>(null)
  const [newWeek, setNewWeek] = useState(1)
  const [newSubject, setNewSubject] = useState("")
  const [labelMode, setLabelMode] = useState<string | null>(null)
  const [fullscreen, setFullscreen] = useState(false)
  const folderInputRef = useRef<HTMLInputElement>(null)

  const loadConfig = async (files: File[]) => {
    const cfg = files.find((f) => f.name === "config.json")
    if (cfg) {
      const text = await cfg.text()
      const data = JSON.parse(text)
      setWeeks(data.weeks || 1)
      setNames(data.names || [])
      setTheory(data.theory || {})
      setPractice(data.practice || {})
      setLabels(data.labels || {})
      setOrders(data.orders || {})
      localStorage.setItem("weeks", String(data.weeks || 1))
      localStorage.setItem("labels", JSON.stringify(data.labels || {}))
      localStorage.setItem("orders", JSON.stringify(data.orders || {}))
      return true
    }
    return false
  }

  const reloadConfig = async () => {
    const ok = await loadConfig(dirFiles)
    alert(ok ? "Configuración recargada" : "config.json no encontrado")
  }

  const handleReselect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    setDirFiles(files)
    loadConfig(files)
  }

  const triggerReselect = () => folderInputRef.current?.click()

  useEffect(() => {
    if (!viewerOpen) setFullscreen(false)
  }, [viewerOpen])

  useEffect(() => {
    if (step === 1) {
      ;(async () => {
        const ok = await loadConfig(dirFiles)
        setConfigFound(ok)
      })()
    }
  }, [step, dirFiles])

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

  // load completed from storage
  useEffect(() => {
    const stored = localStorage.getItem("completed")
    if (stored) setCompleted(JSON.parse(stored))
  }, [])

  // persist completed
  useEffect(() => {
    localStorage.setItem("completed", JSON.stringify(completed))
  }, [completed])

  // load labels and orders
  useEffect(() => {
    const ls = localStorage.getItem("labels")
    if (ls) setLabels(JSON.parse(ls))
    const ord = localStorage.getItem("orders")
    if (ord) setOrders(JSON.parse(ord))
  }, [])

  useEffect(() => {
    localStorage.setItem("labels", JSON.stringify(labels))
  }, [labels])

  useEffect(() => {
    localStorage.setItem("orders", JSON.stringify(orders))
  }, [orders])

  // build tree from selected directory
  useEffect(() => {
    const tree: Record<number, Record<string, PdfFile[]>> = {}
    for (const file of dirFiles) {
      if (!file.name.toLowerCase().endsWith(".pdf")) continue
      const parts = (file as any).webkitRelativePath?.split("/") || []
      if (parts.length >= 4) {
        const weekPart = parts[1]
        const subject = parts[2]
        const week = parseInt(weekPart.replace(/\D/g, ""))
        if (!tree[week]) tree[week] = {}
        if (!tree[week][subject]) tree[week][subject] = []
        tree[week][subject].push({
          file,
          path: parts.slice(1).join("/"),
          week,
          subject,
        })
      }
    }
    for (const w in tree) {
      for (const s in tree[w]) {
        const key = `${w}-${s}`
        if (orders[key]) {
          tree[w][s].sort(
            (a, b) => orders[key].indexOf(a.path) - orders[key].indexOf(b.path),
          )
        } else {
          tree[w][s].sort((a, b) => a.file.name.localeCompare(b.file.name))
        }
      }
    }
    setFileTree(tree)
  }, [dirFiles, orders])

  useEffect(() => {
    const subs = new Set<string>()
    Object.values(fileTree).forEach((subjects) => {
      Object.keys(subjects).forEach((s) => subs.add(s))
    })
    if (subs.size) {
      setNames((prev) => Array.from(new Set([...prev, ...subs])))
    }
  }, [fileTree])

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
        remaining.forEach((f) => {
          const dayName =
            labels[f.path] === "practice" ? practice[subject] : theory[subject]
          if (!dayName) return
          const d = dayMap[dayName]
          let diff = d - today
          if (diff < 0) diff += 7
          if (diff === 0) diff = 7
          if (diff < days) days = diff
        })
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
      case 0: {
        return (
          <main className="min-h-screen flex flex-col items-center justify-center gap-4 p-4">
            <h1 className="text-xl">Comencemos a configurar el entorno</h1>
            <p>Paso 1: Selecciona la carpeta "gestor"</p>
            <input
              type="file"
              // @ts-expect-error webkitdirectory es no estándar
              webkitdirectory=""
              onChange={(e) => {
                setDirFiles(Array.from(e.target.files || []))
                setStep(1)
              }}
            />
          </main>
        )
      }
      case 1: {
        return (
          <main className="min-h-screen flex flex-col items-center justify-center gap-4 p-4">
            {configFound === null && <p>Buscando configuración previa...</p>}
            {configFound === true && (
              <>
                <p>Configuración encontrada. Bienvenido.</p>
                <button
                  className="px-4 py-2 border rounded"
                  onClick={() => {
                    localStorage.setItem("setupComplete", "1")
                    setSetupComplete(true)
                    setStarted(false)
                  }}
                >
                  Continuar
                </button>
              </>
            )}
            {configFound === false && (
              <>
                <p>No se encontró configuración previa.</p>
                <button
                  className="px-4 py-2 border rounded"
                  onClick={() => setStep(2)}
                >
                  Continuar
                </button>
              </>
            )}
          </main>
        )
      }
      case 2: {
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
          setStep(3)
        }
        return (
          <main className="min-h-screen flex flex-col items-center justify-center gap-4 p-4">
            <p>Paso 2: Sube tus cronogramas (excel)</p>
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
      case 3: {
        const updateName = (idx: number, value: string) => {
          const next = [...names]
          next[idx] = value
          setNames(next)
        }
        return (
          <main className="min-h-screen flex flex-col items-center justify-center gap-4 p-4">
            <p>Paso 3: Nombra tus cronogramas</p>
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
              onClick={() => setStep(4)}
            >
              Confirmar
            </button>
          </main>
        )
      }
      case 4: {
        const unassigned = names.filter((n) => !theory[n])
        const handleDrop = (subject: string, day: string) => {
          setTheory({ ...theory, [subject]: day })
        }
        return (
          <main className="min-h-screen flex flex-col items-center gap-4 p-4">
            <p>Paso 4: Arrastra tus materias (teoría) a los días</p>
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
                  setStep(5)
                }}
              >
                Confirmar
              </button>
            )}
          </main>
        )
      }
      case 5: {
        const unassigned = names.filter((n) => !practice[n])
        const handleDrop = (subject: string, day: string) => {
          setPractice({ ...practice, [subject]: day })
        }
        return (
          <main className="min-h-screen flex flex-col items-center gap-4 p-4">
            <p>Paso 5: Arrastra tus materias (práctica) a los días</p>
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
                onClick={() => setStep(6)}
              >
                Confirmar
              </button>
            )}
          </main>
        )
      }
      case 6: {
        const finish = () => {
          const data = { weeks, names, theory, practice, labels, orders }
          const blob = new Blob([JSON.stringify(data)], {
            type: "application/json",
          })
          const url = URL.createObjectURL(blob)
          const a = document.createElement("a")
          a.href = url
          a.download = "config.json"
          a.click()
          URL.revokeObjectURL(url)
          localStorage.setItem("setupComplete", "1")
          localStorage.setItem("weeks", String(weeks))
          setSetupComplete(true)
          setStarted(false)
        }
        return (
          <main className="min-h-screen flex flex-col items-center justify-center gap-4 p-4">
            <p>Paso final: Guarda tu configuración</p>
            <button className="px-4 py-2 border rounded" onClick={finish}>
              Finalizar
            </button>
          </main>
        )
      }
    }
  }

  const daysUntil = (pdf: PdfFile) => {
    const dayMap: Record<string, number> = {
      Lunes: 1,
      Martes: 2,
      Miércoles: 3,
      Jueves: 4,
      Viernes: 5,
    }
    const today = new Date().getDay()
    const dayName =
      labels[pdf.path] === "practice" ? practice[pdf.subject] : theory[pdf.subject]
    if (!dayName) return 0
    const target = dayMap[dayName]
    let diff = target - today
    if (diff < 0) diff += 7
    if (diff === 0) diff = 7
    return diff
  }

  const handleSelectPdf = (pdf: PdfFile) => {
    const idx = queue.findIndex((f) => f.path === pdf.path)
    if (idx >= 0) {
      setQueueIndex(idx)
      setCurrentPdf(queue[idx])
    } else {
      setCurrentPdf(pdf)
    }
  }

  const prevPdf = () => {
    if (queueIndex > 0) {
      const i = queueIndex - 1
      setQueueIndex(i)
      setCurrentPdf(queue[i])
      setViewerOpen(true)
    }
  }

  const nextPdf = () => {
    if (queueIndex < queue.length - 1) {
      const i = queueIndex + 1
      setQueueIndex(i)
      setCurrentPdf(queue[i])
      setViewerOpen(true)
    }
  }

  const toggleComplete = () => {
    if (!currentPdf) return
    const key = currentPdf.path
    setCompleted((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const reorderPdf = (week: number, subject: string, index: number, delta: number) => {
    const arr = [...(fileTree[week]?.[subject] || [])]
    const target = index + delta
    if (target < 0 || target >= arr.length) return
    ;[arr[index], arr[target]] = [arr[target], arr[index]]
    setFileTree({ ...fileTree, [week]: { ...fileTree[week], [subject]: arr } })
    const key = `${week}-${subject}`
    setOrders({ ...orders, [key]: arr.map((p) => p.path) })
  }

  const updateLabel = (path: string, value: string) => {
    setLabels((prev) => ({ ...prev, [path]: value }))
  }

  const pendingFor = (day: string, subject?: string) => {
    const list: PdfFile[] = []
    Object.values(fileTree).forEach((subjects) => {
      Object.entries(subjects).forEach(([s, files]) => {
        if (subject && s !== subject) return
        files.forEach((f) => {
          const type = labels[f.path]
          const dayName = type === "practice" ? practice[s] : theory[s]
          if (dayName === day && !completed[f.path]) list.push(f)
        })
      })
    })
    list.sort((a, b) => a.week - b.week || a.file.name.localeCompare(b.file.name))
    return list
  }

  const colorMap = names.reduce<Record<string, string>>((acc, n, i) => {
    const palette = [
      "bg-red-500",
      "bg-green-500",
      "bg-blue-500",
      "bg-yellow-500",
      "bg-purple-500",
    ]
    acc[n] = palette[i % palette.length]
    return acc
  }, {})

  if (showSchedule) {
    const displayedDays = dayFilter ? [dayFilter] : days
    return (
      <div className="p-4 min-h-screen">
        <button className="underline mb-4" onClick={() => setShowSchedule(false)}>
          Cerrar
        </button>
        <div className="flex items-center gap-2 mb-4">
          <select
            className="border p-1"
            value={newWeek}
            onChange={(e) => setNewWeek(parseInt(e.target.value))}
          >
            {Array.from({ length: weeks }, (_, i) => (
              <option key={i} value={i + 1}>
                Semana {i + 1}
              </option>
            ))}
          </select>
          <input
            className="border p-1"
            placeholder="Materia"
            value={newSubject}
            onChange={(e) => setNewSubject(e.target.value)}
          />
          <button
            className="px-2 py-1 border rounded"
            onClick={() => {
              if (!newSubject.trim()) return
              setFileTree((prev) => {
                const weekTree = prev[newWeek] || {}
                if (weekTree[newSubject]) return prev
                return { ...prev, [newWeek]: { ...weekTree, [newSubject]: [] } }
              })
              setNames((prev) =>
                prev.includes(newSubject.trim())
                  ? prev
                  : [...prev, newSubject.trim()],
              )
              setNewSubject("")
            }}
          >
            Agregar materia
          </button>
        </div>
        <div className="flex gap-2 mb-2">
          <button
            className={!filterSubject ? "font-bold" : ""}
            onClick={() => setFilterSubject(null)}
          >
            Todas
          </button>
          {names.map((n) => (
            <button
              key={n}
              className={filterSubject === n ? "font-bold" : ""}
              onClick={() => setFilterSubject(n)}
            >
              {n}
            </button>
          ))}
        </div>
        <div className="flex gap-2 mb-4">
          <button
            className={!dayFilter ? "font-bold" : ""}
            onClick={() => {
              setDayFilter(null)
              setSelectedDay(null)
            }}
          >
            Todos
          </button>
          {days.map((d) => (
            <button
              key={d}
              className={dayFilter === d ? "font-bold" : ""}
              onClick={() => {
                setDayFilter(d)
                setSelectedDay(d)
              }}
            >
              {d}
            </button>
          ))}
        </div>
        <div className="flex gap-4">
          {displayedDays.map((d) => (
            <div
              key={d}
              className="flex-1 border p-2 cursor-pointer"
              onClick={() => setSelectedDay(d)}
            >
              <div className="font-bold">{d}</div>
              {names
                .filter((n) => !filterSubject || n === filterSubject)
                .filter((n) => theory[n] === d || practice[n] === d)
                .map((n) => {
                  const count = pendingFor(d, n).length
                  return (
                    <div
                      key={n}
                      className={`w-6 h-6 rounded-full ${colorMap[n]} mt-2 flex items-center justify-center text-white`}
                      title={n}
                    >
                      {count}
                    </div>
                  )
                })}
            </div>
          ))}
        </div>
        {selectedDay && (
          <div className="mt-4 text-sm">
            {filterSubject ? (
              pendingFor(selectedDay, filterSubject).length ? (
                <ul>
                  {pendingFor(selectedDay, filterSubject).map((f) => (
                    <li key={f.path} className="truncate" title={f.file.name}>
                      {f.file.name}
                    </li>
                  ))}
                </ul>
              ) : null
            ) : (
              names.map((n) => {
                const list = pendingFor(selectedDay, n)
                if (!list.length) return null
                return (
                  <div key={n} className="mb-2">
                    <div className="font-semibold">{n}</div>
                    <ul className="ml-4">
                      {list.map((f) => (
                        <li key={f.path} className="truncate" title={f.file.name}>
                          {f.file.name}
                        </li>
                      ))}
                    </ul>
                  </div>
                )
              })
            )}
          </div>
        )}
      </div>
    )
  }

  // main interface
  return (
    <>
      <div className="p-2">
        <button className="underline" onClick={() => setShowSchedule(true)}>
          Ver cronograma
        </button>
      </div>
      <main className="grid grid-cols-2 min-h-screen">
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
                const files = (fileTree[viewWeek] || {})[s] || []
                const theoryFiles = files.filter((f) => labels[f.path] === "theory")
                const done = theoryFiles.filter((f) => completed[f.path]).length
                const pct = theoryFiles.length
                  ? Math.round((done / theoryFiles.length) * 100)
                  : 0
                return (
                  <li key={s}>
                    <button onClick={() => setViewSubject(s)}>
                      {s} ({pct}% teoría)
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
            <div className="flex items-center gap-2 mb-2 text-sm">
              <span>Modo etiquetado:</span>
              <button
                className={labelMode === "theory" ? "font-bold" : ""}
                onClick={() => setLabelMode(labelMode === "theory" ? null : "theory")}
              >
                T
              </button>
              <button
                className={labelMode === "practice" ? "font-bold" : ""}
                onClick={() => setLabelMode(labelMode === "practice" ? null : "practice")}
              >
                P
              </button>
            </div>
            <ul className="space-y-1">
              {(fileTree[viewWeek]?.[viewSubject] || []).map((p, idx) => (
                <li
                  key={p.path}
                  className={`flex items-center gap-2 ${
                    completed[p.path] ? "line-through text-gray-400" : ""
                  }`}
                >
                  <span
                    className="flex-1 truncate cursor-pointer"
                    title={p.file.name}
                    onClick={() => {
                      handleSelectPdf(p)
                      if (labelMode) updateLabel(p.path, labelMode)
                    }}
                  >
                    {p.file.name}
                  </span>
                  <select
                    className="text-xs border"
                    value={labels[p.path] || ""}
                    onChange={(e) => updateLabel(p.path, e.target.value)}
                  >
                    <option value="">-</option>
                    <option value="theory">T</option>
                    <option value="practice">P</option>
                  </select>
                  <button onClick={() => reorderPdf(viewWeek!, viewSubject!, idx, -1)}>
                    ↑
                  </button>
                  <button onClick={() => reorderPdf(viewWeek!, viewSubject!, idx, 1)}>
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
            <span
              className="truncate"
              title={currentPdf ? currentPdf.file.name : "Sin selección"}
            >
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
            {currentPdf && <button onClick={() => setViewerOpen(true)}>Abrir</button>}
          </div>
        </div>
        <div className="flex-1">
          {currentPdf && pdfUrl ? (
            <iframe
              title="Previsualización"
              src={`/visor/index.html?url=${encodeURIComponent(pdfUrl)}&name=${encodeURIComponent(
                currentPdf.file.name,
              )}`}
              className="w-full h-full border-0"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-sm text-gray-500">
              Selecciona un PDF
            </div>
          )}
        </div>
        <div className="p-2 text-sm text-gray-500">
          {currentPdf ? `Semana ${currentPdf.week} - ${currentPdf.subject}` : ""}
        </div>
      </section>
    </main>
    <div className="fixed top-2 right-2">
      <button onClick={() => setShowSettings(!showSettings)}>⚙️</button>
      {showSettings && (
        <div className="absolute right-0 mt-2 bg-white border p-2 space-y-2">
          <button onClick={reloadConfig}>Recargar config.json</button>
          <button onClick={triggerReselect}>Reseleccionar carpeta</button>
          <input
            type="file"
            ref={folderInputRef}
            style={{ display: "none" }}
            // @ts-expect-error webkitdirectory no estándar
            webkitdirectory=""
            onChange={handleReselect}
          />
        </div>
      )}
    </div>
    {viewerOpen && currentPdf && pdfUrl && (
      <div className="fixed inset-0 z-50 flex flex-col bg-white dark:bg-gray-900">
        <div
          className={`flex items-center p-2 border-b ${
            fullscreen ? "justify-center" : "justify-between"
          }`}
        >
          <div className="flex items-center gap-2 flex-1 truncate justify-center">
            <span className="truncate" title={currentPdf.file.name}>
              {currentPdf.file.name}
            </span>
          </div>
          {fullscreen ? (
            <button onClick={() => setFullscreen(false)}>✕</button>
          ) : (
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
              <button onClick={() => setFullscreen(true)}>⛶</button>
              <button
                onClick={() => {
                  setViewerOpen(false)
                  setFullscreen(false)
                }}
              >
                ✕
              </button>
            </div>
          )}
        </div>
        <div className="flex-1">
          <iframe
            title="Visor PDF"
            src={`/visor/index.html?url=${encodeURIComponent(pdfUrl)}&name=${encodeURIComponent(
              currentPdf.file.name,
            )}`}
            className="w-full h-full border-0"
          />
        </div>
        {(() => {
          const left = daysUntil(currentPdf)
          const color =
            left <= 1
              ? "text-red-500"
              : left <= 3
              ? "text-yellow-500"
              : "text-green-500"
          return (
            <div className={`p-2 border-t ${color}`}>Días restantes: {left}</div>
          )
        })()}
      </div>
    )}
  </>
  )
}

