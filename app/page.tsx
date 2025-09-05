"use client"

import { useEffect, useRef, useState } from "react"
import { useTheme } from "next-themes"

const days = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"]

type PdfFile = {
  file: File
  path: string
  week: number
  subject: string
  tableType: "theory" | "practice"
  isPdf: boolean
}

const DB_NAME = "folder-handle-db"
const STORE_NAME = "handles"

const openHandleDB = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME)
    }
    req.onerror = () => reject(req.error)
    req.onsuccess = () => resolve(req.result)
  })

const saveHandle = async (handle: FileSystemDirectoryHandle) => {
  const db = await openHandleDB()
  const tx = db.transaction(STORE_NAME, "readwrite")
  tx.objectStore(STORE_NAME).put(handle, "dir")
  await new Promise<void>((res, rej) => {
    tx.oncomplete = () => res()
    tx.onerror = () => rej(tx.error)
  })
  db.close()
}

const loadHandle = async (): Promise<FileSystemDirectoryHandle | null> => {
  const db = await openHandleDB()
  const tx = db.transaction(STORE_NAME, "readonly")
  const req = tx.objectStore(STORE_NAME).get("dir")
  const handle = await new Promise<FileSystemDirectoryHandle | null>((res, rej) => {
    req.onsuccess = () => res(req.result || null)
    req.onerror = () => rej(req.error)
  })
  db.close()
  return handle
}

const verifyPermission = async (handle: FileSystemDirectoryHandle) => {
  if ((await handle.queryPermission({ mode: "read" })) === "granted") return true
  if ((await handle.requestPermission({ mode: "read" })) === "granted") return true
  return false
}

const readAllFiles = async (dir: FileSystemDirectoryHandle) => {
  const files: File[] = []
  const traverse = async (
    directory: FileSystemDirectoryHandle,
    path: string,
  ): Promise<void> => {
    for await (const [name, handle] of (directory as any).entries()) {
      if (handle.kind === "file") {
        const file = await handle.getFile()
        Object.defineProperty(file, "webkitRelativePath", {
          value: `${path}${name}`,
        })
        files.push(file)
      } else if (handle.kind === "directory") {
        await traverse(handle, `${path}${name}/`)
      }
    }
  }
  await traverse(dir, `${dir.name}/`)
  return files
}

export default function Home() {
  const { setTheme, theme } = useTheme()
  const [setupComplete, setSetupComplete] = useState(true)
  const [step, setStep] = useState(0)
  const [names, setNames] = useState<string[]>([])
  const [theory, setTheory] = useState<Record<string, string>>({})
  const [practice, setPractice] = useState<Record<string, string>>({})
  const [weeks, setWeeks] = useState(1)
  const [unlockedWeeks, setUnlockedWeeks] = useState(1)
  const [dirFiles, setDirFiles] = useState<File[]>([])
  const [fileTree, setFileTree] = useState<Record<number, Record<string, PdfFile[]>>>({})
  const [completed, setCompleted] = useState<Record<string, boolean>>({})
  const [currentPdf, setCurrentPdf] = useState<PdfFile | null>(null)
  const [queue, setQueue] = useState<PdfFile[]>([])
  const [queueIndex, setQueueIndex] = useState(0)
  const [viewWeek, setViewWeek] = useState<number | null>(null)
  const [viewSubject, setViewSubject] = useState<string | null>(null)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [embedUrl, setEmbedUrl] = useState<string | null>(null)
  const [orders, setOrders] = useState<Record<string, string[]>>({})
  const [viewerOpen, setViewerOpen] = useState(false)
  const [pdfFullscreen, setPdfFullscreen] = useState(false)
  const [dragCategory, setDragCategory] = useState<'theory' | 'practice' | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [configFound, setConfigFound] = useState<boolean | null>(null)
  const [canonicalSubjects, setCanonicalSubjects] = useState<string[]>([])
  const viewerRef = useRef<HTMLIFrameElement>(null)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const toastTimerRef = useRef<number | null>(null)
  // Avoid hydration mismatch: render only after mounted
  const [mounted, setMounted] = useState(false)

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

  const selectDirectory = async () => {
    try {
      const handle = await (window as any).showDirectoryPicker()
      await saveHandle(handle)
      const rawFiles = await readAllFiles(handle)
      const files = filterSystemFiles(rawFiles)
      setNames([])
      setDirFiles(files)
      void restoreCheckHistory(rawFiles)
      setStep(1)
    } catch (err) {
      console.warn("Directory selection cancelled", err)
    }
  }

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

  // complete setup automatically when config is checked
  useEffect(() => {
    if (step === 1 && configFound !== null) {
      if (configFound) localStorage.setItem("setupComplete", "1")
      setSetupComplete(true)
    }
  }, [step, configFound])

  // allow opening folder selector with Enter on initial screen
  useEffect(() => {
    if (!setupComplete && step === 0) {
      const handler = (e: KeyboardEvent) => {
        if (e.key === "Enter") selectDirectory()
      }
      window.addEventListener("keydown", handler)
      return () => window.removeEventListener("keydown", handler)
    }
  }, [setupComplete, step])

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

  useEffect(() => {
    ;(async () => {
      try {
        const handle = await loadHandle()
        if (handle && (await verifyPermission(handle))) {
          const raw = await readAllFiles(handle)
          const files = filterSystemFiles(raw)
          setDirFiles(files)
          void restoreCheckHistory(raw)
          setStep(1)
          setSetupComplete(true)
          return
        }
      } catch {}
      setSetupComplete(false)
      setStep(0)
    })()
  }, [])

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
    const tree: Record<number, Record<string, PdfFile[]>> = {}
    for (const file of dirFiles) {
      const rel = (file as any).webkitRelativePath || ""
      if (rel.split("/").includes("system")) continue
      const parts = rel.split("/") || []
      if (parts.length >= 4) {
        const weekPart = parts[1]
        const subject = parts[2]
        const tableBase = parts.length > 4 ? parts[3] : "teoria"
        const table = tableBase.toLowerCase().includes("pract")
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
          isPdf: file.name.toLowerCase().endsWith(".pdf"),
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
    const stats: { subject: string; days: number; pdfs: PdfFile[] }[] = []
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

  const toEmbedUrl = (url: string) => {
    try {
      const clean = url.replace(/["']+$/g, "")
      const u = new URL(clean)
      if (u.hostname.includes("youtube.com")) {
        const v = u.searchParams.get("v")
        if (v) return `https://www.youtube.com/embed/${v}`
        const parts = u.pathname.split("/")
        const i = parts.indexOf("embed")
        if (i >= 0 && parts[i + 1]) {
          return `https://www.youtube.com/embed/${parts[i + 1]}`
        }
      }
      if (u.hostname === "youtu.be") {
        const id = u.pathname.slice(1)
        if (id) return `https://www.youtube.com/embed/${id}`
      }
      return clean
    } catch {
      return url.replace(/["']+$/g, "")
    }
  }

  // object url or embed link for viewer
  useEffect(() => {
    if (!currentPdf) {
      setPdfUrl(null)
      setEmbedUrl(null)
      return
    }
    if (currentPdf.isPdf) {
      const url = URL.createObjectURL(currentPdf.file)
      setPdfUrl(url)
      setEmbedUrl(null)
      return () => URL.revokeObjectURL(url)
    }
    setPdfUrl(null)
    ;(async () => {
      try {
        const buf = await currentPdf.file.arrayBuffer()
        const text = new TextDecoder().decode(buf).replace(/\u0000/g, "")
        const matches = text.match(/https?:\/\/[^\s"']+/g) || []
        const raw =
          matches.find((m) => m.includes("youtube")) || matches[0] || null
        const url = raw ? toEmbedUrl(raw) : null
        setEmbedUrl(url)
      } catch {
        setEmbedUrl(null)
      }
    })()
  }, [currentPdf])

  // listen for fullscreen messages from the PDF viewer
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === 'viewerFullscreen') {
        setPdfFullscreen(!!e.data.value)
      }
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [])

  if (!mounted) return null

  // configuration wizard
  if (!setupComplete) {
    switch (step) {
      case 0: {
        return (
          <main className="min-h-screen flex flex-col items-center justify-center gap-4 p-4">
            <h1 className="text-xl">Comencemos a configurar el entorno</h1>
            <p>Paso 1: Selecciona la carpeta "gestor" (Enter para abrir)</p>
            <button onClick={selectDirectory}>Cargar carpeta</button>
          </main>
        )
      }
      case 1: {
        return (
          <main className="min-h-screen flex items-center justify-center p-4">
            <p>Buscando configuración previa...</p>
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
      pdf.tableType === "practice" ? practice[pdf.subject] : theory[pdf.subject]
    if (!dayName) return 0
    const target = dayMap[dayName]
    let diff = target - today
    if (diff < 0) diff += 7
    if (diff === 0) diff = 7
    return diff
  }

  const handleSelectFile = (pdf: PdfFile) => {
    const idx = queue.findIndex((f) => f.path === pdf.path)
    if (idx >= 0) {
      setQueueIndex(idx)
      setCurrentPdf(queue[idx])
    } else {
      setCurrentPdf(pdf)
    }
    if (!pdf.isPdf) setViewerOpen(false)
  }

  const prevPdf = () => {
    if (queueIndex > 0) {
      const i = queueIndex - 1
      setQueueIndex(i)
      setCurrentPdf(queue[i])
      if (!queue[i].isPdf) setViewerOpen(false)
    }
  }

  const nextPdf = () => {
    if (queueIndex < queue.length - 1) {
      const i = queueIndex + 1
      setQueueIndex(i)
      setCurrentPdf(queue[i])
      if (!queue[i].isPdf) setViewerOpen(false)
    }
  }

  const handleDragOverArea = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    const rect = e.currentTarget.getBoundingClientRect()
    const y = e.clientY - rect.top
    setDragCategory(y < rect.height / 2 ? 'theory' : 'practice')
  }

  const handleDragLeaveArea = () => setDragCategory(null)

  const handleDropLink = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    const data =
      e.dataTransfer.getData('text/uri-list') ||
      e.dataTransfer.getData('text/plain')
    if (!data) {
      setDragCategory(null)
      return
    }
    const category = dragCategory || 'theory'
    const suggested = data.includes('youtube') ? 'video.lnk' : 'enlace.lnk'
    const name = prompt('Nombre del enlace:', suggested)
    if (!name) {
      setDragCategory(null)
      return
    }
    const fileName = name.endsWith('.lnk') ? name : `${name}.lnk`
    const content = `[InternetShortcut]\nURL=${data}\n`
    const file = new File([content], fileName, { type: 'text/plain' })
    Object.defineProperty(file, 'webkitRelativePath', {
      value: `root/Semana${viewWeek}/${viewSubject}/${category}/${fileName}`,
    })
    setDirFiles((prev) => [...prev, file])
    const path = `Semana${viewWeek}/${viewSubject}/${category}/${fileName}`
    const pdf: PdfFile = {
      file,
      path,
      week: viewWeek!,
      subject: viewSubject!,
      tableType: category,
      isPdf: false,
    }
    setCurrentPdf(pdf)
    setDragCategory(null)
  }

  const toggleComplete = async () => {
    if (!currentPdf) return
    const key = currentPdf.path
    const wasCompleted = !!completed[key]
    setCompleted((prev) => ({ ...prev, [key]: !wasCompleted }))
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current)
    setToast({ type: 'success', text: 'Guardado en localStorage' })
    toastTimerRef.current = window.setTimeout(() => setToast(null), 3000)
    try {
      const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
      const canonical = canonicalSubjects.find(s => norm(s) === norm(currentPdf.subject)) || currentPdf.subject
      const resp = await fetch("/api/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: canonical,
          tableType: currentPdf.tableType,
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

  const reorderPdf = (week: number, subject: string, index: number, delta: number) => {
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
              {Object.entries(fileTree[viewWeek] || {})
                .filter(([, files]) => files.length > 0)
                .map(([s, files]) => {
                  const theoryFiles = files.filter(
                    (f) => f.tableType === "theory",
                  )
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
            <div
              className="relative space-y-4"
              onDragOver={handleDragOverArea}
              onDragLeave={handleDragLeaveArea}
              onDrop={handleDropLink}
            >
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
                          <span>{p.isPdf ? "📄" : "🔗"}</span>
                          <span
                            className="flex-1 truncate cursor-pointer"
                            title={p.file.name}
                            onClick={() => handleSelectFile(p)}
                          >
                            {p.file.name}
                          </span>
                          <button onClick={() => reorderPdf(viewWeek!, viewSubject!, idx, -1)}>
                            ↑
                          </button>
                          <button onClick={() => reorderPdf(viewWeek!, viewSubject!, idx, 1)}>
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
                          <span>{p.isPdf ? "📄" : "🔗"}</span>
                          <span
                            className="flex-1 truncate cursor-pointer"
                            title={p.file.name}
                            onClick={() => handleSelectFile(p)}
                          >
                            {p.file.name}
                          </span>
                          <button onClick={() => reorderPdf(viewWeek!, viewSubject!, idx, -1)}>
                            ↑
                          </button>
                          <button onClick={() => reorderPdf(viewWeek!, viewSubject!, idx, 1)}>
                            ↓
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )}
              {dragCategory && (
                <div className="absolute inset-0 flex flex-col bg-white/90 dark:bg-gray-800/90 pointer-events-none">
                  <div
                    className={`flex-1 flex items-center justify-center ${
                      dragCategory === 'theory'
                        ? 'bg-gray-200 dark:bg-gray-700'
                        : ''
                    }`}
                  >
                    Teoría
                  </div>
                  <div
                    className={`flex-1 flex items-center justify-center ${
                      dragCategory === 'practice'
                        ? 'bg-gray-200 dark:bg-gray-700'
                        : ''
                    }`}
                  >
                    Práctica
                  </div>
                </div>
              )}
            </div>
          </>
        )}
        </aside>
       <section
          className={`flex flex-col flex-1 md:h-screen ${viewerOpen ? 'fixed inset-0 z-50 bg-white dark:bg-gray-900' : ''}`}
        >
          {viewerOpen ? (
            !pdfFullscreen && (
              <div className="flex flex-wrap items-center justify-between p-2 border-b gap-2">
                <span className="truncate" title={currentPdf?.file.name}>
                  {currentPdf?.file.name}
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <span>
                    Días restantes: {currentPdf ? daysUntil(currentPdf) : ''}
                  </span>
                  <button
                    onClick={() =>
                      viewerRef.current?.contentWindow?.postMessage(
                        { type: 'toggleFullscreen' },
                        '*'
                      )
                    }
                  >
                    {pdfFullscreen ? '🗗' : '⛶'}
                  </button>
                  <button
                    onClick={() => {
                      setTheme(theme === 'light' ? 'dark' : 'light')
                      viewerRef.current?.contentWindow?.postMessage(
                        { type: 'toggleTheme' },
                        '*'
                      )
                    }}
                  >
                    {theme === 'light' ? '🌞' : '🌙'}
                  </button>
                  <button
                    onClick={() => {
                      setViewerOpen(false)
                      setPdfFullscreen(false)
                      viewerRef.current?.contentWindow?.postMessage(
                        { type: 'resetZoom' },
                        '*'
                      )
                    }}
                  >
                    ✕
                  </button>
                </div>
              </div>
            )
          ) : (
            <div className="flex flex-wrap items-center justify-between p-2 border-b gap-2">
              <div className="flex items-center gap-2">
                <span>📄</span>
                <span
                  className="truncate"
                  title={currentPdf ? currentPdf.file.name : 'Sin selección'}
                >
                  {currentPdf ? currentPdf.file.name : 'Sin selección'}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
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
          )}
          <div className="flex-1">
            {currentPdf && (pdfUrl || embedUrl) ? (
              <iframe
                ref={viewerRef}
                title={viewerOpen ? (currentPdf.isPdf ? 'Visor PDF' : 'Visor') : 'Previsualización'}
                src={
                  currentPdf.isPdf
                    ? `/visor/index.html?url=${encodeURIComponent(pdfUrl!)}&name=${encodeURIComponent(
                        currentPdf.file.name,
                      )}`
                    : embedUrl!
                }
                className="w-full h-full border-0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-sm text-gray-500">
                Selecciona un archivo
              </div>
            )}
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
          <button onClick={selectDirectory}>Reseleccionar carpeta</button>
          <button onClick={unlockNextWeek}>Unlock Next Semana</button>
        </div>
      )}
    </div>
  </>
  )
}

