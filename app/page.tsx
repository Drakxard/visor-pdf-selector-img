"use client"

import { useEffect, useRef, useState } from "react"
import { useTheme } from "next-themes"

const days = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"]

type ResourceFile = {
  file: File
  path: string
  week: number
  subject: string
  tableType: "theory" | "practice"
}

export default function Home() {
  const { setTheme } = useTheme()
  const [started, setStarted] = useState(false)
  const [setupComplete, setSetupComplete] = useState(true)
  const [step, setStep] = useState(0)
  const [names, setNames] = useState<string[]>([])
  const [theory, setTheory] = useState<Record<string, string>>({})
  const [practice, setPractice] = useState<Record<string, string>>({})
  const [weeks, setWeeks] = useState(1)
  const [unlockedWeeks, setUnlockedWeeks] = useState(1)
  const [dirFiles, setDirFiles] = useState<File[]>([])
  const [fileTree, setFileTree] = useState<Record<number, Record<string, ResourceFile[]>>>({})
  const [completed, setCompleted] = useState<Record<string, boolean>>({})
  const [currentFile, setCurrentFile] = useState<ResourceFile | null>(null)
  const [queue, setQueue] = useState<ResourceFile[]>([])
  const [queueIndex, setQueueIndex] = useState(0)
  const [viewWeek, setViewWeek] = useState<number | null>(null)
  const [viewSubject, setViewSubject] = useState<string | null>(null)
  const [fileUrl, setFileUrl] = useState<string | null>(null)
  const [orders, setOrders] = useState<Record<string, string[]>>({})
  const [viewerOpen, setViewerOpen] = useState(false)
  const [fileFullscreen, setFileFullscreen] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [configFound, setConfigFound] = useState<boolean | null>(null)
  const [canonicalSubjects, setCanonicalSubjects] = useState<string[]>([])
  const folderInputRef = useRef<HTMLInputElement>(null)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const toastTimerRef = useRef<number | null>(null)
  // Avoid hydration mismatch: render only after mounted
  const [mounted, setMounted] = useState(false)

  const getEmbedUrl = (url: string) => {
    try {
      const u = new URL(url)
      if (u.hostname.includes('youtube.com')) {
        const v = u.searchParams.get('v')
        if (v) return `https://www.youtube.com/embed/${v}`
      }
      if (u.hostname === 'youtu.be') {
        const id = u.pathname.slice(1)
        if (id) return `https://www.youtube.com/embed/${id}`
      }
    } catch {}
    return url
  }

  const filterSystemFiles = (files: File[]) =>
    files.filter(
      (f) => !((f as any).webkitRelativePath || "").split("/").includes("system"),
    )

  const loadConfig = async (files: File[]) => {
    const cfg = files.find((f) => f.name === "config.json")
    if (cfg) {
      const text = await cfg.text()
      const data = JSON.parse(text)
      setWeeks(data.weeks || 1)
      setNames(data.names || [])
      setTheory(data.theory || {})
      setPractice(data.practice || {})
      setOrders(data.orders || {})
      localStorage.setItem("weeks", String(data.weeks || 1))
      localStorage.setItem("orders", JSON.stringify(data.orders || {}))
      return true
    }
    return false
  }

  const restoreCheckHistory = async (rawFiles: File[]) => {
    try {
      const full = rawFiles.find((f) => ((f as any).webkitRelativePath || '').toLowerCase().endsWith('/system/check-semanas/check-history.json'))
      if (full) {
        const txt = await full.text()
        const data = JSON.parse(txt || '{}')
        if (data && typeof data === 'object' && data.completed) {
          setCompleted((prev) => ({ ...prev, ...data.completed }))
          setToast({ type: 'success', text: 'Historial restaurado desde: system/check-semanas/check-history.json' })
          if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current)
          toastTimerRef.current = window.setTimeout(() => setToast(null), 3000)
          return
        }
      }
      const historyW1 = rawFiles.find((f) => ((f as any).webkitRelativePath || '').toLowerCase().endsWith('/system/check-semanas/check-history-sem1.json'))
      if (historyW1) {
        const txt = await historyW1.text()
        const data = JSON.parse(txt || '{}')
        if (data && typeof data === 'object' && data.completed) {
          setCompleted((prev) => ({ ...prev, ...data.completed }))
          setToast({ type: 'success', text: 'Historial Semana 1 restaurado desde: system/check-semanas/check-history-sem1.json' })
          if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current)
          toastTimerRef.current = window.setTimeout(() => setToast(null), 3000)
        }
      }
    } catch (err) {
      console.warn('No se pudo leer check-history-sem1.json', err)
    }
  }

  const handleReselect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawFiles = Array.from(e.target.files || [])
    const files = filterSystemFiles(rawFiles)
    setDirFiles(files)
    loadConfig(files)
    void restoreCheckHistory(rawFiles)
  }

  const triggerReselect = () => folderInputRef.current?.click()

  const unlockNextWeek = () => {
    setUnlockedWeeks((prev) => {
      const next = Math.min(weeks, prev + 1)
      localStorage.setItem("unlockedWeeks", String(next))
      setToast({ type: 'success', text: `Semana ${next} desbloqueada` })
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current)
      toastTimerRef.current = window.setTimeout(() => setToast(null), 3000)
      return next
    })
  }

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
    setMounted(true)
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
      const storedUnlocked = parseInt(localStorage.getItem("unlockedWeeks") || "1")
      setUnlockedWeeks(storedUnlocked)
    }
  }, [setTheme])

  // cleanup toast timer on unmount
  useEffect(() => {
    return () => {
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current)
    }
  }, [])

  // fetch canonical subjects from DB (for accent/case tolerant updates)
  useEffect(() => {
    ;(async () => {
      try {
        const r = await fetch('/api/progress/subjects')
        if (!r.ok) return
        const j = await r.json()
        const subs = Array.from(new Set<string>((j.rows || []).map((x: any) => x.subject_name)))
        setCanonicalSubjects(subs)
      } catch {}
    })()
  }, [])

  // greeting handler
  useEffect(() => {
    const handler = () => setStarted(true)
    if (!started) {
      window.addEventListener("keydown", handler)
      window.addEventListener("pointerdown", handler)
      return () => {
        window.removeEventListener("keydown", handler)
        window.removeEventListener("pointerdown", handler)
      }
    }
  }, [started])

  // load completed from storage
  useEffect(() => {
    const stored = localStorage.getItem("completed")
    if (stored) setCompleted(JSON.parse(stored))
  }, [])

  // load subjects from storage
  useEffect(() => {
    const storedNames = localStorage.getItem("names")
    if (storedNames) setNames(JSON.parse(storedNames))
    const storedTheory = localStorage.getItem("theory")
    if (storedTheory) setTheory(JSON.parse(storedTheory))
    const storedPractice = localStorage.getItem("practice")
    if (storedPractice) setPractice(JSON.parse(storedPractice))
  }, [])

  // persist completed
  useEffect(() => {
    localStorage.setItem("completed", JSON.stringify(completed))
  }, [completed])

  useEffect(() => {
    localStorage.setItem("names", JSON.stringify(names))
  }, [names])

  useEffect(() => {
    localStorage.setItem("theory", JSON.stringify(theory))
  }, [theory])

  useEffect(() => {
    localStorage.setItem("practice", JSON.stringify(practice))
  }, [practice])


// load orders
useEffect(() => {
  const ord = localStorage.getItem("orders")
  if (ord) setOrders(JSON.parse(ord))
}, [])

useEffect(() => {
  localStorage.setItem("orders", JSON.stringify(orders))
}, [orders])

  // build tree from selected directory
  useEffect(() => {
    const tree: Record<number, Record<string, ResourceFile[]>> = {}
    for (const file of dirFiles) {
      const rel = (file as any).webkitRelativePath || ""
      if (rel.split("/").includes("system")) continue
      const parts = rel.split("/") || []
      if (parts.length >= 5) {
        const weekPart = parts[1]
        const subject = parts[2]
        const table = parts[3].toLowerCase().includes("pract")
          ? "practice"
          : "theory"
        const week = parseInt(weekPart.replace(/\D/g, ""))
        if (!tree[week]) tree[week] = {}
        if (!tree[week][subject]) tree[week][subject] = []
        tree[week][subject].push({
          file,
          path: parts.slice(1).join("/"),
          week,
          subject,
          tableType: table,
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
    for (let w = 1; w <= weeks; w++) {
      if (!tree[w]) tree[w] = {}
      names.forEach((n) => {
        if (!tree[w][n]) tree[w][n] = []
      })
    }
    setFileTree(tree)
  }, [dirFiles, orders, weeks, names])

  useEffect(() => {
    const subs = new Set<string>()
    Object.values(fileTree).forEach((subjects) => {
      Object.keys(subjects).forEach((s) => subs.add(s))
    })
    if (subs.size && names.length === 0) {
      setNames(Array.from(subs))
    }
  }, [fileTree, names.length])

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
    const stats: { subject: string; days: number; files: ResourceFile[] }[] = []
    Object.values(fileTree).forEach((subjects) => {
      Object.entries(subjects).forEach(([subject, files]) => {
        const remaining = files.filter((f) => !completed[f.path])
        if (!remaining.length) return
        let days = 7
        remaining.forEach((f) => {
          const dayName =
            f.tableType === "practice" ? practice[subject] : theory[subject]
          if (!dayName) return
          const d = dayMap[dayName]
          let diff = d - today
          if (diff < 0) diff += 7
          if (diff === 0) diff = 7
          if (diff < days) days = diff
        })
        stats.push({ subject, days, files: remaining })
      })
    })
    stats.sort((a, b) => {
      if (a.days !== b.days) return a.days - b.days
      return b.files.length - a.files.length
    })
    const q: ResourceFile[] = []
    stats.forEach((s) => {
      q.push(
        ...s.files.sort((a, b) => a.week - b.week || a.file.name.localeCompare(b.file.name)),
      )
    })
    setQueue(q)
    if (q.length) {
      const current = currentFile && q.find((f) => f.path === currentFile.path)
      const target = current || q[0]
      setCurrentFile(target)
      setQueueIndex(q.findIndex((f) => f.path === target.path))
    } else {
      setCurrentFile(null)
      setQueueIndex(0)
    }
  }, [fileTree, completed, theory, practice])

  // object url or external link for viewer
  useEffect(() => {
    let revoke: string | null = null
    let active = true
    const setup = async () => {
      if (!currentFile) {
        setFileUrl(null)
        return
      }
      const name = currentFile.file.name.toLowerCase()
      if (name.endsWith('.url')) {
        try {
          const txt = await currentFile.file.text()
          const match = txt.match(/^URL=(.*)$/m)
          const link = match ? match[1].trim() : txt.trim()
          if (active) setFileUrl(getEmbedUrl(link))
        } catch {
          if (active) setFileUrl(null)
        }
      } else {
        const url = URL.createObjectURL(currentFile.file)
        revoke = url
        if (active) setFileUrl(url)
      }
    }
    void setup()
    return () => {
      active = false
      if (revoke) URL.revokeObjectURL(revoke)
    }
  }, [currentFile])

  // listen for fullscreen messages from the viewer
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === 'viewerFullscreen') {
        setFileFullscreen(!!e.data.value)
      }
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [])

  // greeting screen
  if (!mounted) return null
  if (!started) {
    const hour = new Date().getHours()
    const greeting = hour >= 19 || hour < 6 ? "Buenas noches" : "Buenos días"
    return (
      <main className="min-h-screen flex items-center justify-center text-2xl">
        <p>{greeting}. Toca la pantalla o presiona una tecla para continuar.</p>
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
                const rawFiles = Array.from(e.target.files || [])
                const files = filterSystemFiles(rawFiles)
                setDirFiles(files)
                void restoreCheckHistory(rawFiles)
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
                  onClick={() => {
                    setSetupComplete(true)
                    setStarted(false)
                  }}
                >
                  Continuar
                </button>
              </>
            )}
          </main>
        )
      }
    }
  }

  const daysUntil = (file: ResourceFile) => {
    const dayMap: Record<string, number> = {
      Lunes: 1,
      Martes: 2,
      Miércoles: 3,
      Jueves: 4,
      Viernes: 5,
    }
    const today = new Date().getDay()
    const dayName =
      file.tableType === "practice" ? practice[file.subject] : theory[file.subject]
    if (!dayName) return 0
    const target = dayMap[dayName]
    let diff = target - today
    if (diff < 0) diff += 7
    if (diff === 0) diff = 7
    return diff
  }

  const handleSelectFile = (file: ResourceFile) => {
    const idx = queue.findIndex((f) => f.path === file.path)
    if (idx >= 0) {
      setQueueIndex(idx)
      setCurrentFile(queue[idx])
    } else {
      setCurrentFile(file)
    }
  }

  const prevFile = () => {
    if (queueIndex > 0) {
      const i = queueIndex - 1
      setQueueIndex(i)
      setCurrentFile(queue[i])
      setViewerOpen(true)
    }
  }

  const nextFile = () => {
    if (queueIndex < queue.length - 1) {
      const i = queueIndex + 1
      setQueueIndex(i)
      setCurrentFile(queue[i])
      setViewerOpen(true)
    }
  }

  const toggleComplete = async () => {
    if (!currentFile) return
    const key = currentFile.path
    const wasCompleted = !!completed[key]
    setCompleted((prev) => ({ ...prev, [key]: !wasCompleted }))
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current)
    setToast({ type: 'success', text: 'Guardado en localStorage' })
    toastTimerRef.current = window.setTimeout(() => setToast(null), 3000)
    try {
      const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
      const canonical = canonicalSubjects.find(s => norm(s) === norm(currentFile.subject)) || currentFile.subject
      const resp = await fetch("/api/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: canonical,
          tableType: currentFile.tableType,
          delta: wasCompleted ? -1 : 1,
        }),
      })
      let body: any = null
      try { body = await resp.json() } catch {}
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current)
      }
      if (!resp.ok) {
        setToast({ type: 'error', text: `Error (${resp.status}) al guardar progreso` })
      } else {
        setToast({ type: 'success', text: 'Progreso guardado' })
      }
      toastTimerRef.current = window.setTimeout(() => setToast(null), 3000)
    } catch (err) {
      console.error("Failed to update progress", err)
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current)
      }
      setToast({ type: 'error', text: 'Error de red al guardar el progreso' })
      toastTimerRef.current = window.setTimeout(() => setToast(null), 3000)
    }
  }

  const reorderFile = (week: number, subject: string, index: number, delta: number) => {
    const arr = [...(fileTree[week]?.[subject] || [])]
    const target = index + delta
    if (target < 0 || target >= arr.length) return
    ;[arr[index], arr[target]] = [arr[target], arr[index]]
    setFileTree({ ...fileTree, [week]: { ...fileTree[week], [subject]: arr } })
    const key = `${week}-${subject}`
    setOrders({ ...orders, [key]: arr.map((p) => p.path) })
  }

  const selectedFiles =
    viewWeek && viewSubject ? fileTree[viewWeek]?.[viewSubject] || [] : []
  const theoryFiles = selectedFiles.filter((f) => f.tableType === "theory")
  const practiceFiles = selectedFiles.filter((f) => f.tableType === "practice")

  // main interface
  return (
    <>
      <main className="flex flex-col md:grid md:grid-cols-2 min-h-screen">
        <aside className="border-b md:border-r p-4 space-y-2">
        {!viewWeek && (
          <>
            <h2 className="text-xl">Semanas</h2>
            <ul className="space-y-1">
              {Array.from({ length: weeks }, (_, i) => {
                const wk = i + 1
                const locked = wk > unlockedWeeks
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
                const theoryFiles = files.filter((f) => f.tableType === "theory")
                const practiceFiles = files.filter(
                  (f) => f.tableType === "practice",
                )
                const doneTheory = theoryFiles.filter(
                  (f) => completed[f.path],
                ).length
                const donePractice = practiceFiles.filter(
                  (f) => completed[f.path],
                ).length
                return (
                  <li key={s}>
                    <button onClick={() => setViewSubject(s)}>
                      {s} (T {doneTheory}/{theoryFiles.length} - P {donePractice}/
                      {practiceFiles.length})
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
            <div className="space-y-4">
              {theoryFiles.length > 0 && (
                <div>
                  <h3 className="font-semibold">Teoría:</h3>
                  <ul className="space-y-1">
                    {theoryFiles.map((p) => {
                      const idx = selectedFiles.indexOf(p)
                      return (
                        <li
                          key={p.path}
                          className={`flex flex-wrap items-center gap-2 ${
                            completed[p.path] ? "line-through text-gray-400" : ""
                          }`}
                        >
                          <span
                            className="flex-1 truncate cursor-pointer"
                            title={p.file.name}
                            onClick={() => handleSelectFile(p)}
                          >
                            {p.file.name}
                          </span>
                          <button onClick={() => reorderFile(viewWeek!, viewSubject!, idx, -1)}>
                            ↑
                          </button>
                          <button onClick={() => reorderFile(viewWeek!, viewSubject!, idx, 1)}>
                            ↓
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )}
              {practiceFiles.length > 0 && (
                <div>
                  <h3 className="font-semibold">Práctica:</h3>
                  <ul className="space-y-1">
                    {practiceFiles.map((p) => {
                      const idx = selectedFiles.indexOf(p)
                      return (
                        <li
                          key={p.path}
                          className={`flex flex-wrap items-center gap-2 ${
                            completed[p.path] ? "line-through text-gray-400" : ""
                          }`}
                        >
                          <span
                            className="flex-1 truncate cursor-pointer"
                            title={p.file.name}
                            onClick={() => handleSelectFile(p)}
                          >
                            {p.file.name}
                          </span>
                          <button onClick={() => reorderFile(viewWeek!, viewSubject!, idx, -1)}>
                            ↑
                          </button>
                          <button onClick={() => reorderFile(viewWeek!, viewSubject!, idx, 1)}>
                            ↓
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )}
            </div>
          </>
        )}
        </aside>
        <section className="flex flex-col flex-1 md:h-screen">
        <div className="flex flex-wrap items-center justify-between p-2 border-b gap-2">
          <div className="flex items-center gap-2">
            <span>📄</span>
            <span
              className="truncate"
              title={currentFile ? currentFile.file.name : "Sin selección"}
            >
              {currentFile ? currentFile.file.name : "Sin selección"}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={prevFile} disabled={queueIndex <= 0}>
              ←
            </button>
            <button onClick={nextFile} disabled={queueIndex >= queue.length - 1}>
              →
            </button>
            {currentFile && (
              <input
                type="checkbox"
                checked={!!completed[currentFile.path]}
                onChange={toggleComplete}
              />
            )}
            {currentFile && <button onClick={() => setViewerOpen(true)}>Abrir</button>}
          </div>
        </div>
        <div className="flex-1">
          {currentFile && fileUrl ? (
            currentFile.file.name.toLowerCase().endsWith('.pdf') ? (
              <iframe
                title="Previsualización"
                src={`/visor/index.html?url=${encodeURIComponent(fileUrl)}&name=${encodeURIComponent(
                  currentFile.file.name,
                )}`}
                className="w-full h-full border-0"
              />
            ) : (
              <iframe
                title="Previsualización"
                src={fileUrl}
                className="w-full h-full border-0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            )
          ) : (
            <div className="w-full h-full flex items-center justify-center text-sm text-gray-500">
              Selecciona un archivo
            </div>
          )}
        </div>
        <div className="p-2 text-sm text-gray-500">
          {currentFile ? `Semana ${currentFile.week} - ${currentFile.subject}` : ""}
        </div>
        </section>
      </main>
    {/* Toast banner */}
    {toast && (
      <div
        className={`fixed bottom-4 right-4 z-50 px-4 py-2 rounded shadow text-white ${
          toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'
        }`}
        role="status"
        aria-live="polite"
      >
        {toast.text}
      </div>
    )}
    <div className="fixed top-2 right-2">
      <button onClick={() => setShowSettings(!showSettings)}>⚙️</button>
      {showSettings && (
        <div className="absolute right-0 mt-2 bg-white border p-2 space-y-2">
          <button onClick={triggerReselect}>Reseleccionar carpeta</button>
          <button onClick={unlockNextWeek}>Unlock Next Semana</button>
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
    {viewerOpen && currentFile && fileUrl && (
      <div className="fixed inset-0 z-50 flex flex-col bg-white dark:bg-gray-900">
        {!fileFullscreen && (
          <div className="flex flex-wrap items-center justify-between p-2 border-b gap-2">
            <span className="truncate" title={currentFile.file.name}>
              {currentFile.file.name}
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <span>
                Días restantes: {daysUntil(currentFile)}
              </span>
              <button
                onClick={() => {
                  setViewerOpen(false)
                  setFileFullscreen(false)
                }}
              >
                ✕
              </button>
            </div>
          </div>
        )}
        <div className="flex-1">
          {currentFile.file.name.toLowerCase().endsWith('.pdf') ? (
            <iframe
              title="Visor"
              src={`/visor/index.html?url=${encodeURIComponent(fileUrl)}&name=${encodeURIComponent(
                currentFile.file.name,
              )}`}
              className="w-full h-full border-0"
            />
          ) : (
            <iframe
              title="Visor"
              src={fileUrl}
              className="w-full h-full border-0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          )}
        </div>
      </div>
    )}
  </>
  )
}

