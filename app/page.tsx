"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useTheme } from "next-themes"

const days = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"]

type PdfFile = {
  file: File
  path: string
  week: string
  subject: string
  tableType: "theory" | "practice"
  isPdf: boolean
  url?: string
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
  const [weeks, setWeeks] = useState<string[]>([])
  const [dirFiles, setDirFiles] = useState<File[]>([])
  const [fileTree, setFileTree] = useState<Record<string, PdfFile[]>>({})
  const [completed, setCompleted] = useState<Record<string, boolean>>({})
  const [currentPdf, setCurrentPdf] = useState<PdfFile | null>(null)
  const [queue, setQueue] = useState<PdfFile[]>([])
  const [queueIndex, setQueueIndex] = useState(0)
  const [viewWeek, setViewWeek] = useState<string | null>(null)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [embedUrl, setEmbedUrl] = useState<string | null>(null)
  const [viewerOpen, setViewerOpen] = useState(false)
  const [pdfFullscreen, setPdfFullscreen] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showDarkModal, setShowDarkModal] = useState(false)
  const [darkModeStart, setDarkModeStart] = useState(19)
  const [configFound, setConfigFound] = useState<boolean | null>(null)
  const [canonicalSubjects, setCanonicalSubjects] = useState<string[]>([])
  // const [timerRunning, setTimerRunning] = useState(false)
  // const [elapsedSeconds, setElapsedSeconds] = useState(0)
  // const [unsentSeconds, setUnsentSeconds] = useState(0)
  // const [todaySeconds, setTodaySeconds] = useState(0)
  // const [currentDate, setCurrentDate] = useState(
  //   new Date().toISOString().split('T')[0],
  // )
  const viewerRef = useRef<HTMLIFrameElement>(null)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const toastTimerRef = useRef<number | null>(null)
  // const autoPausedRef = useRef(false)
  const [restored, setRestored] = useState(false)
  // Avoid hydration mismatch: render only after mounted
  const [mounted, setMounted] = useState(false)

  // const formatHM = (sec: number) => {
  //   const h = Math.floor(sec / 3600)
  //     .toString()
  //     .padStart(2, '0')
  //   const m = Math.floor((sec % 3600) / 60)
  //     .toString()
  //     .padStart(2, '0')
  //   return `${h}:${m}`
  // }

  // const formatHMS = (sec: number) => {
  //   const h = Math.floor(sec / 3600)
  //     .toString()
  //     .padStart(2, '0')
  //   const m = Math.floor((sec % 3600) / 60)
  //     .toString()
  //     .padStart(2, '0')
  //   const s = Math.floor(sec % 60)
  //     .toString()
  //     .padStart(2, '0')
  //   return `${h}:${m}:${s}`
  // }

  // const sendTime = async (sec: number) => {
  //   if (sec <= 0) return
  //   try {
  //     const res = await fetch('/api/time', {
  //       method: 'POST',
  //       headers: { 'Content-Type': 'application/json' },
  //       body: JSON.stringify({ seconds: sec }),
  //     })
  //     const data = await res.json()
  //     if (typeof data.seconds === 'number') {
  //       setTodaySeconds(data.seconds)
  //     }
  //   } catch (err) {
  //     console.error('sendTime error', err)
  //   }
  // }

  // const pauseTimer = useCallback(() => {
  //   setTimerRunning(false)
  //   if (unsentSeconds > 0) {
  //     sendTime(unsentSeconds)
  //     setUnsentSeconds(0)
  //   }
  // }, [unsentSeconds])

  // const startTimer = useCallback(() => {
  //   const todayStr = new Date().toISOString().split('T')[0]
  //   if (todayStr !== currentDate) {
  //     setCurrentDate(todayStr)
  //     setTodaySeconds(0)
  //   }
  //   setTimerRunning(true)
  // }, [currentDate])

  // const toggleTimer = useCallback(() => {
  //   if (timerRunning) {
  //     pauseTimer()
  //     setToast({ type: 'success', text: 'Cronómetro pausado' })
  //   } else {
  //     startTimer()
  //     setToast({ type: 'success', text: 'Cronómetro iniciado' })
  //   }
  //   if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current)
  //   toastTimerRef.current = window.setTimeout(() => setToast(null), 3000)
  // }, [timerRunning, pauseTimer, startTimer])

  // useEffect(() => {
  //   const fetchToday = async () => {
  //     try {
  //       const res = await fetch('/api/time')
  //       const data = await res.json()
  //       if (typeof data.seconds === 'number') setTodaySeconds(data.seconds)
  //     } catch (err) {
  //       console.error('fetchToday error', err)
  //     }
  //   }
  //   fetchToday()
  // }, [])

  // useEffect(() => {
  //   if (!timerRunning || document.visibilityState !== 'visible') return
  //   const id = window.setInterval(() => {
  //     setElapsedSeconds((s) => s + 1)
  //     setTodaySeconds((s) => s + 1)
  //     setUnsentSeconds((s) => s + 1)
  //   }, 1000)
  //   return () => window.clearInterval(id)
  // }, [timerRunning])

  // useEffect(() => {
  //   const handler = (e: KeyboardEvent) => {
  //     if (e.key.toLowerCase() === 'c' && viewerOpen) {
  //       e.preventDefault()
  //       toggleTimer()
  //     }
  //   }
  //   window.addEventListener('keydown', handler)
  //   return () => window.removeEventListener('keydown', handler)
  // }, [viewerOpen, toggleTimer])

  // useEffect(() => {
  //   const handler = (e: MessageEvent) => {
  //     if (e.data?.type === 'toggleTimer' && viewerOpen) {
  //       toggleTimer()
  //     }
  //   }
  //   window.addEventListener('message', handler)
  //   return () => window.removeEventListener('message', handler)
  // }, [viewerOpen, toggleTimer])

  // useEffect(() => {
  //   const vis = () => {
  //     if (document.visibilityState === 'hidden') {
  //       if (timerRunning) {
  //         autoPausedRef.current = true
  //         pauseTimer()
  //       }
  //     } else if (document.visibilityState === 'visible' && autoPausedRef.current) {
  //       autoPausedRef.current = false
  //       startTimer()
  //     }
  //   }
  //   document.addEventListener('visibilitychange', vis)
  //   return () => document.removeEventListener('visibilitychange', vis)
  // }, [timerRunning, pauseTimer, startTimer])

  // useEffect(() => {
  //   if (!viewerOpen) {
  //     if (timerRunning) pauseTimer()
  //     setElapsedSeconds(0)
  //     setUnsentSeconds(0)
  //   }
  // }, [viewerOpen, timerRunning, pauseTimer])

  useEffect(() => {
    viewerRef.current?.contentWindow?.postMessage(
      { type: 'setTheme', theme },
      '*',
    )
  }, [theme, viewerOpen])

  const applyTheme = (start: number) => {
    const hour = new Date().getHours()
    if (hour >= start || hour < 6) {
      setTheme('dark')
    } else {
      setTheme('light')
    }
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
      setNames(data.names || [])
      setTheory(data.theory || {})
      setPractice(data.practice || {})
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

  useEffect(() => {
    if (step === 1) {
      ;(async () => {
        const ok = await loadConfig(dirFiles)
        setConfigFound(ok)
      })()
    }
  }, [step, dirFiles])

  useEffect(() => {
    const dirs: string[] = []
    dirFiles.forEach((f) => {
      const rel = ((f as any).webkitRelativePath || "") as string
      const parts = rel.split("/")
      if (parts.length > 1) {
        const folder = parts[1]
        if (folder && folder !== "system" && !dirs.includes(folder)) dirs.push(folder)
      }
    })
    setWeeks(dirs)
  }, [dirFiles])

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
    const storedStart = parseInt(localStorage.getItem('darkModeStart') || '19')
    setDarkModeStart(storedStart)
    applyTheme(storedStart)
    const stored = localStorage.getItem("setupComplete")
    if (!stored) {
      setSetupComplete(false)
    }
  }, [setTheme])

  useEffect(() => {
    if (!mounted) return
    localStorage.setItem('darkModeStart', darkModeStart.toString())
    applyTheme(darkModeStart)
  }, [darkModeStart, mounted])

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


  // build tree from selected directory
  useEffect(() => {
    const tree: Record<string, PdfFile[]> = {}
    for (const file of dirFiles) {
      const rel = (file as any).webkitRelativePath || ""
      if (rel.split("/").includes("system")) continue
      const parts = rel.split("/") || []
      if (parts.length > 1) {
        const folder = parts[1]
        if (!tree[folder]) tree[folder] = []
        if (file.name.toLowerCase().endsWith(".pdf")) {
          tree[folder].push({
            file,
            path: parts.slice(1).join("/"),
            week: folder,
            subject: "",
            tableType: "theory",
            isPdf: true,
          })
        }
      }
    }
    setFileTree(tree)
  }, [dirFiles])

  // compute queue from all pdfs
  useEffect(() => {
    const q = Object.values(fileTree)
      .flat()
      .filter((f) => !completed[f.path])
      .sort((a, b) => a.file.name.localeCompare(b.file.name))
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
  }, [fileTree, completed])

  // restore last opened file when queue is ready
  useEffect(() => {
    if (!restored && queue.length) {
      const last = localStorage.getItem('lastPath')
      if (last) {
        const idx = queue.findIndex((f) => f.path === last)
        if (idx >= 0) {
          const pdf = queue[idx]
          setCurrentPdf(pdf)
          setQueueIndex(idx)
          setViewWeek(pdf.week)
        }
      }
      setRestored(true)
    }
  }, [queue, restored])

  const toEmbedUrl = (url: string) => {
    try {
      const u = new URL(url)
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
      return url
    } catch {
      return url
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
    if (currentPdf.url) {
      setPdfUrl(null)
      setEmbedUrl(toEmbedUrl(currentPdf.url))
      return
    }
    setPdfUrl(null)
    ;(async () => {
      try {
        const buf = await currentPdf.file.arrayBuffer()
        const text = new TextDecoder().decode(buf).replace(/\u0000/g, "")
        const match = text.match(/https?:\/\/[^\s]+/)
        const raw = match ? match[0] : null
        const url = raw ? toEmbedUrl(raw) : null
        setEmbedUrl(url)
      } catch {
        setEmbedUrl(null)
      }
    })()
  }, [currentPdf])

  // remember last opened file
  useEffect(() => {
    if (currentPdf) {
      localStorage.setItem('lastPath', currentPdf.path)
      localStorage.setItem('lastWeek', currentPdf.week)
      localStorage.setItem('lastSubject', currentPdf.subject)
    }
  }, [currentPdf])

  // listen for messages from the PDF viewer
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === 'viewerFullscreen') {
        setPdfFullscreen(!!e.data.value)
      }
      if (e.data?.type === 'viewerPage') {
        localStorage.setItem('lastPage', String(e.data.page))
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
    // if (timerRunning) pauseTimer()
    // setElapsedSeconds(0)
    // setUnsentSeconds(0)
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
      // if (timerRunning) pauseTimer()
      // setElapsedSeconds(0)
      // setUnsentSeconds(0)
      const i = queueIndex - 1
      setQueueIndex(i)
      setCurrentPdf(queue[i])
      if (!queue[i].isPdf) setViewerOpen(false)
    }
  }

  const nextPdf = () => {
    if (queueIndex < queue.length - 1) {
      // if (timerRunning) pauseTimer()
      // setElapsedSeconds(0)
      // setUnsentSeconds(0)
      const i = queueIndex + 1
      setQueueIndex(i)
      setCurrentPdf(queue[i])
      if (!queue[i].isPdf) setViewerOpen(false)
    }
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


  const selectedFiles = viewWeek ? fileTree[viewWeek] || [] : []

  // main interface
  return (
    <>
      <main className="flex flex-col md:grid md:grid-cols-2 min-h-screen">
        <aside className="border-b md:border-r p-4 space-y-2">
        {viewWeek !== null && (
          <button className="mb-2 underline" onClick={() => { setViewWeek(null); }}>
            Inicio
          </button>
        )}
        {!viewWeek && (
          <>
            <h2 className="text-xl">Carpetas</h2>
            <ul className="space-y-1">
              {weeks.map((wk) => (
                <li key={wk} className="font-bold">
                  <button onClick={() => setViewWeek(wk)}>{wk}</button>
                </li>
              ))}
            </ul>
          </>
        )}
        {viewWeek && (
          <>
            <button className="mb-2 underline" onClick={() => setViewWeek(null)}>
              ← Volver
            </button>
            <h2 className="text-xl">{viewWeek}</h2>
            <ul className="space-y-1">
              {selectedFiles.map((p) => (
                <li
                  key={p.path}
                  className={`flex items-center gap-2 ${
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
                </li>
              ))}
            </ul>
          </>
        )}
        </aside>
       <section
          className={`flex flex-col flex-1 md:h-screen ${viewerOpen ? 'fixed inset-0 z-50 bg-white dark:bg-gray-900' : ''}`}
        >
          {viewerOpen ? (
            !pdfFullscreen && (
              <div className="flex flex-wrap items-center justify-between p-2 border-b gap-2">
                <div className="flex items-center gap-2">
                  <span className="truncate" title={currentPdf?.file.name}>
                    {currentPdf?.file.name}
                  </span>
                  {/* <span>{formatHMS(elapsedSeconds)}</span> */}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => {
                      setViewerOpen(false)
                      setPdfFullscreen(false)
                        setViewWeek(null)
                      }}
                  >
                    Inicio
                  </button>
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
                  {/* <span>Hoy: {formatHM(todaySeconds)}</span> */}
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
                onLoad={() =>
                  viewerRef.current?.contentWindow?.postMessage(
                    { type: 'setTheme', theme },
                    '*',
                  )
                }
                title={viewerOpen ? (currentPdf.isPdf ? 'Visor PDF' : 'Visor') : 'Previsualización'}
                src={
                  currentPdf.isPdf
                    ? `/visor/index.html?url=${encodeURIComponent(pdfUrl!)}&name=${encodeURIComponent(
                        currentPdf.file.name,
                      )}&key=${encodeURIComponent(currentPdf.path)}`
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
        <div className="absolute right-0 mt-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-2 space-y-2 text-sm text-gray-800 dark:text-gray-200">
          <button className="block w-full text-left" onClick={selectDirectory}>Reseleccionar carpeta</button>
          <button className="block w-full text-left" onClick={() => setShowDarkModal(true)}>Configurar modo oscuro</button>
        </div>
      )}
    </div>

    {showDarkModal && (
      <div className="fixed inset-0 flex items-center justify-center bg-black/50 z-50">
        <div className="bg-white dark:bg-gray-800 p-4 rounded shadow space-y-4 w-72 text-gray-800 dark:text-gray-200">
          <div className="text-center text-lg">Horario modo oscuro</div>
          <div className="flex flex-col items-center space-y-2">
            <div className="text-xl font-mono">
              {`${darkModeStart.toString().padStart(2, '0')}:00`}
            </div>
            <div className="relative w-full">
              <div className="absolute w-full flex justify-center -top-5 pointer-events-none">
                <span>↓</span>
              </div>
              <input
                type="range"
                min="18"
                max="24"
                value={darkModeStart === 0 ? 24 : darkModeStart}
                onChange={(e) =>
                  setDarkModeStart(parseInt(e.target.value) === 24 ? 0 : parseInt(e.target.value))
                }
                className="w-full"
              />
            </div>
          </div>
          <div className="flex justify-end">
            <button onClick={() => setShowDarkModal(false)} className="px-3 py-1 border rounded dark:border-gray-600">Cerrar</button>
          </div>
        </div>
      </div>
    )}
  </>
  )
}

