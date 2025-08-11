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
}

export default function Home() {
  const { theme, setTheme } = useTheme()
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
  const [currentPdf, setCurrentPdf] = useState<PdfFile | null>(null)
  const [queue, setQueue] = useState<PdfFile[]>([])
  const [queueIndex, setQueueIndex] = useState(0)
  const [viewWeek, setViewWeek] = useState<number | null>(null)
  const [viewSubject, setViewSubject] = useState<string | null>(null)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [labels, setLabels] = useState<Record<string, string>>({})
  const [orders, setOrders] = useState<Record<string, string[]>>({})
  const [showSchedule, setShowSchedule] = useState(false)
  const [filterSubject, setFilterSubject] = useState<string | null>(null)
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const [dirHandle, setDirHandle] = useState<any>(null)
  const [configHandle, setConfigHandle] = useState<any>(null)

  const writeConfig = async (handle?: any) => {
    try {
      const fh = handle || configHandle
      if (!fh) return
      const writable = await fh.createWritable()
      await writable.write(
        JSON.stringify({ weeks, completed, labels, orders, theory, practice })
      )
      await writable.close()
    } catch {}
  }

  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark")
  }

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

  useEffect(() => {
    if (!dirHandle) return
    ;(async () => {
      try {
        const systemDir = await dirHandle.getDirectoryHandle("system", { create: true })
        let fileHandle
        try {
          fileHandle = await systemDir.getFileHandle("config.json")
          const file = await fileHandle.getFile()
          const data = JSON.parse(await file.text())
          setCompleted(data.completed || {})
          setLabels(data.labels || {})
          setOrders(data.orders || {})
          setWeeks(data.weeks || 1)
          setTheory(data.theory || {})
          setPractice(data.practice || {})
        } catch {
          fileHandle = await systemDir.getFileHandle("config.json", { create: true })
          await writeConfig(fileHandle)
        }
        setConfigHandle(fileHandle)
      } catch {}
    })()
  }, [dirHandle])

  useEffect(() => {
    writeConfig()
  }, [weeks, completed, labels, orders, theory, practice])

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
        const pickFolder = async () => {
          try {
            const handle = await (window as any).showDirectoryPicker({ mode: "readwrite" })
            setDirHandle(handle)
            const all: File[] = []
            const walk = async (dir: any, path: string) => {
              for await (const [name, entry] of dir.entries()) {
                if (entry.kind === "file") {
                  const f = await entry.getFile()
                  ;(f as any).webkitRelativePath = path ? `${path}/${name}` : name
                  all.push(f)
                } else if (entry.kind === "directory") {
                  await walk(entry, path ? `${path}/${name}` : name)
                }
              }
            }
            await walk(handle, "")
            setDirFiles(all)
            setFolderReady(true)
          } catch {}
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
            <button className="px-4 py-2 border rounded" onClick={pickFolder}>
              Seleccionar carpeta
            </button>
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
    }
  }

  const nextPdf = () => {
    if (queueIndex < queue.length - 1) {
      const i = queueIndex + 1
      setQueueIndex(i)
      setCurrentPdf(queue[i])
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

  // main interface
  return (
    <>
      <div className="p-2">
        <button className="underline" onClick={() => setShowSchedule(!showSchedule)}>
          {showSchedule ? "Ocultar cronograma" : "Ver cronograma"}
        </button>
      </div>
      {showSchedule && (
        <div className="p-4 border-b">
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
          <div className="flex gap-4">
            {days.map((d) => (
              <div
                key={d}
                className="flex-1 border p-2 cursor-pointer"
                onClick={() => setSelectedDay(d)}
              >
                <div className="font-bold">{d}</div>
                {names
                  .filter((n) => !filterSubject || n === filterSubject)
                  .flatMap((n) => {
                    const arr: any[] = []
                    if (theory[n] === d)
                      arr.push(
                        <div
                          key={n + "t"}
                          className={`w-6 h-6 rounded-full ${colorMap[n]} mt-2`}
                          title={`${n} Teoría`}
                        />,
                      )
                    if (practice[n] === d)
                      arr.push(
                        <div
                          key={n + "p"}
                          className={`w-6 h-6 rounded-full ${colorMap[n]} mt-2 border`}
                          title={`${n} Práctica`}
                        />,
                      )
                    return arr
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
      )}
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
                    onClick={() => handleSelectPdf(p)}
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
          </div>
        </div>
        <div className="flex-1">
          {currentPdf && pdfUrl ? (
            <iframe
              title="Visor PDF"
              src={`/visor/index.html?url=${encodeURIComponent(pdfUrl)}&name=${encodeURIComponent(
                currentPdf.file.name,
              )}`}
              className="w-full h-full border-0"
            />
          ) : (
            <div className="p-4 text-sm text-gray-500">
              {currentPdf
                ? `Semana ${currentPdf.week} - ${currentPdf.subject}`
                : "Selecciona un PDF"}
            </div>
          )}
        </div>
        {currentPdf && (() => {
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
      </section>
    </main>
    <button
      className="fixed top-2 right-2 p-2 border rounded"
      onClick={toggleTheme}
    >
      {theme === "dark" ? "🌞" : "🌙"}
    </button>
  </>
  )
}

