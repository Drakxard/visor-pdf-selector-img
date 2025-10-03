"use client"

import { FormEvent, useCallback, useEffect, useRef, useState } from "react"
import { useTheme } from "next-themes"

const days = ["Lunes", "Martes", "MiÃ©rcoles", "Jueves", "Viernes"]

type PdfFile = {
  file: File
  path: string
  week: string
  subject: string
  tableType: "theory" | "practice"
  isPdf: boolean
  url?: string
  mediaType?: 'pdf' | 'video' | 'link'
}

type DirectoryEntry = {
  path: string
  name: string
  parent: string | null
  subdirs: string[]
  files: PdfFile[]
}

type MoodleFolderConfig = {
  id: string
  basePath: string
  category: 'theory' | 'practice'
  subjectKey: string
  subjectName: string
  courseId: number
  folderId: number
  lastSynced?: string
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

const verifyPermission = async (
  handle: FileSystemDirectoryHandle | FileSystemFileHandle,
  mode: "read" | "readwrite" = "read",
) => {
  const anyHandle = handle as any
  if (typeof anyHandle.queryPermission === "function") {
    try {
      if ((await anyHandle.queryPermission({ mode })) === "granted") return true
    } catch {
      // ignore query errors
    }
  }
  if (typeof anyHandle.requestPermission === "function") {
    try {
      if ((await anyHandle.requestPermission({ mode })) === "granted") return true
    } catch {
      // ignore request errors
    }
  }
  return false
}

const readAllEntries = async (
  dir: FileSystemDirectoryHandle,
): Promise<{ files: File[]; directories: string[] }> => {
  const files: File[] = []
  const directories = new Set<string>()
  const traverse = async (
    directory: FileSystemDirectoryHandle,
    relativePath: string,
  ): Promise<void> => {
    for await (const [name, handle] of (directory as any).entries()) {
      if (isHiddenSegment(name)) continue
      if (handle.kind === "file") {
        const file = await handle.getFile()
        const rel = relativePath ? `${relativePath}/${name}` : name
        if (rel.split('/').some((segment) => isHiddenSegment(segment))) continue
        Object.defineProperty(file, "webkitRelativePath", {
          value: `${dir.name}/${rel}`,
        })
        files.push(file)
      } else if (handle.kind === "directory") {
        const rel = relativePath ? `${relativePath}/${name}` : name
        directories.add(rel)
        await traverse(handle, rel)
      }
    }
  }
  const legacyPath = typeof item.path === 'string' ? item.path : ''
  if (!legacyPath) return null
  const folderId = Number(item.folderId) || 0
  if (!folderId) return null
  const context = extractSubjectContext(legacyPath)
  if (!context.basePath) return null
  let category: 'theory' | 'practice' = 'theory'
  const lastSegment = legacyPath.split('/').filter(Boolean).pop() || ''
  if (matchesCategorySegment(lastSegment, 'practice')) {
    category = 'practice'
  }
  const id =
    typeof item.id === 'string'
      ? item.id
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`
  return {
    id,
    basePath: context.basePath,
    category,
    subjectKey: context.subjectKey,
    subjectName: context.subjectName || 'Materia',
    courseId: Number(item.courseId) || 0,
    folderId,
    lastSynced: item.lastSynced,
  }
}

export default function Home() {
  const { setTheme, theme } = useTheme()
  const [setupComplete, setSetupComplete] = useState(true)
  const [step, setStep] = useState(0)
  const [names, setNames] = useState<string[]>([])
  const [theory, setTheory] = useState<Record<string, string>>({})
  const [practice, setPractice] = useState<Record<string, string>>({})
  const [dirFiles, setDirFiles] = useState<File[]>([])
  const [dirPaths, setDirPaths] = useState<string[]>([])
  const [rootHandle, setRootHandle] = useState<FileSystemDirectoryHandle | null>(null)
  const [directoryTree, setDirectoryTree] = useState<
    Record<string, DirectoryEntry>
  >({})
  const [completed, setCompleted] = useState<Record<string, boolean>>({})
  const [currentPdf, setCurrentPdf] = useState<PdfFile | null>(null)
  const [queue, setQueue] = useState<PdfFile[]>([])
  const [queueIndex, setQueueIndex] = useState(0)
  const [viewWeek, setViewWeek] = useState<string | null>(null)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [embedUrl, setEmbedUrl] = useState<string | null>(null)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
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
  const [showMoodleModal, setShowMoodleModal] = useState(false)
  const [moodleToken, setMoodleToken] = useState<string>('')
  const [moodleFolders, setMoodleFolders] = useState<MoodleFolderConfig[]>([])
  const [syncingFolderId, setSyncingFolderId] = useState<string | null>(null)
  const [moodleError, setMoodleError] = useState<string | null>(null)
  const [courseInput, setCourseInput] = useState('')
  const [theoryFolderInput, setTheoryFolderInput] = useState('')
  const [practiceFolderInput, setPracticeFolderInput] = useState('')
  const showToastMessage = useCallback((type: 'success' | 'error', text: string) => {
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current)
    setToast({ type, text })
    toastTimerRef.current = window.setTimeout(() => setToast(null), 3000)
  }, [])
  // const autoPausedRef = useRef(false)
  const [restored, setRestored] = useState(false)
  // Avoid hydration mismatch: render only after mounted
  const [mounted, setMounted] = useState(false)

  const currentPath = useMemo(() => {
    if (viewWeek) return viewWeek
    if (currentPdf?.week) return currentPdf.week
    return ''
  }, [viewWeek, currentPdf])

  const modalSubjectContext = useMemo(() => extractSubjectContext(currentPath), [currentPath])

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
  //     setToast({ type: 'success', text: 'CronÃ³metro pausado' })
  //   } else {
  //     startTimer()
  //     setToast({ type: 'success', text: 'CronÃ³metro iniciado' })
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

  const filterSystemEntries = (files: File[], directories: string[]) => {
    const filteredFiles = files.filter((f) => {
      const rel = ((f as any).webkitRelativePath || '').split('/')
      return !rel.some((segment: string) => isHiddenSegment(segment))
    })
    const filteredDirs = directories.filter(
      (dir) => !dir.split('/').some((segment) => isHiddenSegment(segment))
    )
    return { files: filteredFiles, directories: filteredDirs }
  }
  const resolveCategoryDirPath = useCallback(
    (basePath: string, category: 'theory' | 'practice') => {
      if (!basePath) return ''
      const entry = directoryTree[basePath]
      if (entry) {
        const match = entry.subdirs.find((dir) => {
          const segments = dir.split('/').filter(Boolean)
          const last = segments[segments.length - 1] || ''
          return matchesCategorySegment(last, category)
        })
        if (match) return match
      }
      const segments = basePath.split('/').filter(Boolean)
      if (segments.length) {
        const last = segments[segments.length - 1] || ''
        if (matchesCategorySegment(last, category)) {
          return basePath
        }
      }
      return basePath
    },
    [directoryTree],
  )

  const collectCategoryFiles = useCallback(
    (basePath: string, category: 'theory' | 'practice') => {
      if (!basePath) return []
      const normalized = basePath
      const files: PdfFile[] = []
      Object.values(directoryTree).forEach((entry) => {
        if (!entry.path) return
        if (entry.path === normalized || entry.path.startsWith(`${normalized}/`)) {
          entry.files.forEach((file) => {
            if (file.tableType === category) files.push(file)
          })
        }
      })
      return files.sort((a, b) =>
        a.file.name.localeCompare(b.file.name, undefined, { numeric: true, sensitivity: 'base' }),
      )
    },
    [directoryTree],
  )

  const refreshDirectory = useCallback(
    async (handle?: FileSystemDirectoryHandle | null) => {
      const target = handle ?? rootHandle
      if (!target) return
      const entries = await readAllEntries(target)
      const filtered = filterSystemEntries(entries.files, entries.directories)
      setDirFiles(filtered.files)
      setDirPaths(filtered.directories)
    },
    [rootHandle],
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

  const handleSyncMoodleFolder = useCallback(
    async (config: MoodleFolderConfig) => {
      if (!rootHandle) {
        const message = 'Selecciona una carpeta local antes de sincronizar'
        setMoodleError(message)
        return { ok: false as const, error: message }
      }
      const token = moodleToken.trim()
      if (!token) {
        const message = 'Ingresa el token de Moodle'
        setMoodleError(message)
        return { ok: false as const, error: message }
      }
      if (!config.courseId || config.courseId <= 0) {
        const message = 'Curso invalido'
        setMoodleError(message)
        return { ok: false as const, error: message }
      }
      if (!config.folderId || config.folderId <= 0) {
        const message = 'Folder invalido'
        setMoodleError(message)
        return { ok: false as const, error: message }
      }
      const targetPath = resolveCategoryDirPath(config.basePath, config.category)
      if (!targetPath) {
        const message = 'No se encontro la carpeta destino'
        setMoodleError(message)
        return { ok: false as const, error: message }
      }
      setMoodleError(null)
      setSyncingFolderId(config.id)
      try {
        const contentsResp = await fetch('/api/moodle/contents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, courseId: config.courseId }),
        })
        const payload = await contentsResp.json().catch(() => null)
        if (!contentsResp.ok || !payload?.ok) {
          const message = payload?.error || `Error HTTP ${contentsResp.status}`
          throw new Error(message)
        }
        const sections = payload.data
        if (!Array.isArray(sections)) {
          throw new Error('Respuesta inesperada del servidor')
        }
        let targetModule: any = null
        for (const section of sections) {
          if (targetModule) break
          const modules = Array.isArray(section?.modules) ? section.modules : []
          for (const mod of modules) {
            if (mod?.id === config.folderId || String(mod?.id) === String(config.folderId)) {
              targetModule = mod
              break
            }
          }
        }
        if (!targetModule) {
          throw new Error('No se encontro la carpeta solicitada en el curso')
        }
        const contents = Array.isArray(targetModule.contents)
          ? targetModule.contents.filter((c: any) => c && c.fileurl)
          : []
        if (!contents.length) {
          throw new Error('La carpeta no posee archivos disponibles')
        }
        const dirHandle = await getDirectoryHandleForPath(rootHandle, targetPath)
        if (!(await verifyPermission(dirHandle, 'readwrite'))) {
          throw new Error('Se requieren permisos de escritura en la carpeta destino')
        }
        let downloaded = 0
        for (const item of contents) {
          const baseName = typeof item.filename === 'string' ? item.filename : ''
          const rawFileUrl = typeof item.fileurl === 'string' ? item.fileurl : ''
          const fallbackBase = rawFileUrl ? rawFileUrl.split('?')[0] : ''
          const fallback = fallbackBase ? fallbackBase.split('/').pop() || 'archivo.pdf' : 'archivo.pdf'
          const filename = baseName || fallback
          if (!rawFileUrl) continue
          const downloadResp = await fetch('/api/moodle/download', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: rawFileUrl, token }),
          })
          if (!downloadResp.ok) {
            let errorMessage = `Error HTTP ${downloadResp.status}`
            try {
              const errJson = await downloadResp.json()
              if (errJson?.error) errorMessage = errJson.error
            } catch {}
            throw new Error(`No se pudo descargar ${filename} (${errorMessage})`)
          }
          const buffer = await downloadResp.arrayBuffer()
          const fileHandle = await dirHandle.getFileHandle(filename, { create: true })
          if (!(await verifyPermission(fileHandle, 'readwrite'))) {
            throw new Error(`Sin permiso para escribir ${filename}`)
          }
          const writable = await fileHandle.createWritable()
          await writable.write(buffer)
          await writable.close()
          downloaded += 1
        }
        await refreshDirectory(rootHandle)
        return { ok: true as const, count: downloaded }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Error inesperado al descargar'
        setMoodleError(message)
        return { ok: false as const, error: message }
      } finally {
        setSyncingFolderId(null)
      }
    },
    [rootHandle, moodleToken, resolveCategoryDirPath, refreshDirectory],
  )

  const handleCategorySync = useCallback(
    async (category: 'theory' | 'practice') => {
      const basePath = modalSubjectContext.basePath
      const subjectKey = modalSubjectContext.subjectKey
      const subjectName = modalSubjectContext.subjectName || 'Materia'
      if (!basePath) {
        setMoodleError('Navega hasta una materia antes de sincronizar')
        return
      }
      const token = moodleToken.trim()
      if (!token) {
        setMoodleError('Ingresa el token de Moodle')
        return
      }
      const parsedCourseId = Number(courseInput.trim())
      if (!Number.isFinite(parsedCourseId) || parsedCourseId <= 0) {
        setMoodleError('Ingresa un curso valido')
        return
      }
      const folderValue = category === 'theory' ? theoryFolderInput : practiceFolderInput
      const parsedFolderId = Number(folderValue.trim())
      if (!Number.isFinite(parsedFolderId) || parsedFolderId <= 0) {
        setMoodleError('Ingresa un folder valido')
        return
      }
      const existing = moodleFolders.find(
        (item) => item.basePath === basePath && item.category === category,
      )
      const config: MoodleFolderConfig = existing
        ? {
            ...existing,
            courseId: parsedCourseId,
            folderId: parsedFolderId,
            subjectName,
          }
        : {
            id:
              typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
                ? crypto.randomUUID()
                : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
            basePath,
            category,
            subjectKey,
            subjectName,
            courseId: parsedCourseId,
            folderId: parsedFolderId,
          }
      const result = await handleSyncMoodleFolder(config)
      if (result.ok) {
        const timestamp = new Date().toISOString()
        setMoodleFolders((prev) => {
          const withCourse = prev.map((item) =>
            item.subjectKey === subjectKey ? { ...item, courseId: parsedCourseId } : item,
          )
          const index = withCourse.findIndex(
            (item) => item.basePath === basePath && item.category === category,
          )
          const entry = { ...config, lastSynced: timestamp }
          if (index >= 0) {
            const updated = [...withCourse]
            updated[index] = entry
            return updated
          }
          return [...withCourse, entry]
        })
        setCourseInput(String(parsedCourseId))
        if (category === 'theory') {
          setTheoryFolderInput(String(parsedFolderId))
        } else {
          setPracticeFolderInput(String(parsedFolderId))
        }
        setMoodleError(null)
        showToastMessage('success', `Descargados ${result.count} archivos`)
      } else {
        setMoodleError(result.error)
        showToastMessage('error', result.error)
      }
    },
    [
      modalSubjectContext.basePath,
      modalSubjectContext.subjectKey,
      modalSubjectContext.subjectName,
      moodleToken,
      courseInput,
      theoryFolderInput,
      practiceFolderInput,
      moodleFolders,
      handleSyncMoodleFolder,
      showToastMessage,
    ],
  )

  const handleClearCategory = useCallback(
    (category: 'theory' | 'practice') => {
      const basePath = modalSubjectContext.basePath
      if (!basePath) return
      setMoodleFolders((prev) =>
        prev.filter((item) => !(item.basePath === basePath && item.category === category)),
      )
      if (category === 'theory') {
        setTheoryFolderInput('')
      } else {
        setPracticeFolderInput('')
      }
    },
    [modalSubjectContext.basePath],
  )

  const handleRemoveMoodleConfig = useCallback(
    (config: MoodleFolderConfig) => {
      setMoodleFolders((prev) => prev.filter((item) => item.id !== config.id))
      if (config.basePath === modalSubjectContext.basePath) {
        if (config.category === 'theory') setTheoryFolderInput('')
        if (config.category === 'practice') setPracticeFolderInput('')
      }
    },
    [modalSubjectContext.basePath],
  )

  useEffect(() => {
    if (!showMoodleModal) return
    const basePath = modalSubjectContext.basePath
    if (!basePath) {
      setCourseInput('')
      setTheoryFolderInput('')
      setPracticeFolderInput('')
      return
    }
    const courseConfig = moodleFolders.find(
      (item) => item.subjectKey === modalSubjectContext.subjectKey && item.courseId,
    )
    setCourseInput(courseConfig ? String(courseConfig.courseId) : '')
    setTheoryFolderInput(theoryConfigForCurrent ? String(theoryConfigForCurrent.folderId) : '')
    setPracticeFolderInput(practiceConfigForCurrent ? String(practiceConfigForCurrent.folderId) : '')
  }, [
    showMoodleModal,
    modalSubjectContext.basePath,
    modalSubjectContext.subjectKey,
    moodleFolders,
    theoryConfigForCurrent?.folderId,
    practiceConfigForCurrent?.folderId,
  ])

  useEffect(() => {
    if (showMoodleModal) setMoodleError(null)
  }, [showMoodleModal])
  const selectDirectory = async () => {
    try {
      const handle = await (window as any).showDirectoryPicker()
      await saveHandle(handle)
      setRootHandle(handle)
      const entries = await readAllEntries(handle)
      const filtered = filterSystemEntries(entries.files, entries.directories)
      setNames([])
      setDirFiles(filtered.files)
      setDirPaths(filtered.directories)
      void restoreCheckHistory(entries.files)
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
    const storedFolders = localStorage.getItem('moodleFolders')
    if (!storedFolders) return
    try {
      const parsed = JSON.parse(storedFolders)
      if (!Array.isArray(parsed)) return
      const upgraded = parsed
        .map((item: any) => upgradeLegacyConfig(item))
        .filter((item): item is MoodleFolderConfig => !!item)
      setMoodleFolders(upgraded)
    } catch {}
  }, [])

  useEffect(() => {
    ;(async () => {
      try {
        const handle = await loadHandle()
        if (handle && (await verifyPermission(handle))) {
          setRootHandle(handle)
          const entries = await readAllEntries(handle)
          const filtered = filterSystemEntries(entries.files, entries.directories)
          setDirFiles(filtered.files)
          setDirPaths(filtered.directories)
          void restoreCheckHistory(entries.files)
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

  useEffect(() => {
    if (!mounted) return
    localStorage.setItem('moodleFolders', JSON.stringify(moodleFolders))
  }, [moodleFolders, mounted])


  // build directory structure from selected directory
  useEffect(() => {
    const map = new Map<string, DirectoryEntry>()

    const ensureDir = (path: string) => {
      if (map.has(path)) return map.get(path)!
      const segments = path.split("/").filter(Boolean)
      const name = segments.length ? segments[segments.length - 1] : ""
      const parentPath = segments.slice(0, -1).join("/")
      const parent = segments.length ? parentPath : null
      const entry: DirectoryEntry = {
        path,
        name,
        parent,
        subdirs: [],
        files: [],
      }
      map.set(path, entry)
      if (parent !== null) {
        const parentEntry = ensureDir(parent)
        if (!parentEntry.subdirs.includes(path)) {
          parentEntry.subdirs.push(path)
        }
      }
      return entry
    }

    ensureDir("")

    for (const dirPath of dirPaths) {
      if (dirPath) ensureDir(dirPath)
    }

    for (const file of dirFiles) {
      const rel = (file as any).webkitRelativePath || ""
      const parts = rel.split("/").slice(1)
      if (!parts.length) continue
      if (parts.some((segment) => !segment || isHiddenSegment(segment))) continue
      const dirPath = parts.slice(0, -1).join("/")
      const entry = ensureDir(dirPath)
      const nameLower = file.name.toLowerCase()
      const isPdf = nameLower.endsWith(".pdf")
      const isVideo = /\.(mp4|webm|ogg|mov|mkv)$/.test(nameLower)
      if (!isPdf && !isVideo) continue
      const mediaType = isPdf ? 'pdf' : 'video'
      const pathSegments = dirPath.split('/').filter(Boolean)
      const tableType: 'theory' | 'practice' = pathSegments.some((segment) => matchesCategorySegment(segment, 'practice')) ? 'practice' : 'theory'
      const { subjectName } = extractSubjectContext(dirPath)
      const item: PdfFile = {
        file,
        path: parts.join("/"),
        week: dirPath,
        subject: subjectName,
        tableType,
        isPdf,
        mediaType,
      }
      entry.files.push(item)
    }

    map.forEach((entry) => {
      entry.subdirs.sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }),
      )
      entry.files.sort((a, b) =>
        a.file.name.localeCompare(b.file.name, undefined, {
          numeric: true,
          sensitivity: "base",
        }),
      )
    })

    setDirectoryTree(Object.fromEntries(map))
  }, [dirFiles, dirPaths])

  // compute queue from all pdfs
  useEffect(() => {
    const q = Object.values(directoryTree)
      .flatMap((entry) => entry.files)
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
  }, [directoryTree, completed])

  useEffect(() => {
    if (viewWeek && !directoryTree[viewWeek]) {
      setViewWeek(null)
    }
  }, [viewWeek, directoryTree])

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
          setViewWeek(pdf.week ? pdf.week : null)
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
      setVideoUrl(null)
      return
    }
    if (currentPdf.mediaType === 'video') {
      const url = URL.createObjectURL(currentPdf.file)
      setVideoUrl(url)
      setPdfUrl(null)
      setEmbedUrl(null)
      return () => URL.revokeObjectURL(url)
    }
    setVideoUrl(null)
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
      if (e.data?.type === 'openInBrowser') {
        // open current PDF blob in a new tab using the browser viewer
        if (currentPdf?.isPdf && pdfUrl) {
          try {
            window.open(pdfUrl, '_blank', 'noopener,noreferrer')
          } catch {}
        }
      }
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [currentPdf, pdfUrl])

  // Global key: press 'a' (when not typing) to open current PDF in a new tab
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key || '').toLowerCase() !== 'a') return
      // Ignore if typing inside inputs/textareas/contentEditable elements
      const el = (document.activeElement as HTMLElement | null)
      const tag = (el?.tagName || '').toUpperCase()
      const isTyping = !!(
        el && (
          el.isContentEditable ||
          tag === 'TEXTAREA' ||
          (tag === 'INPUT' && (el as HTMLInputElement).type !== 'checkbox' && (el as HTMLInputElement).type !== 'button')
        )
      )
      if (isTyping) return
      if (currentPdf?.isPdf && pdfUrl) {
        e.preventDefault()
        try { window.open(pdfUrl, '_blank', 'noopener,noreferrer') } catch {}
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [currentPdf, pdfUrl])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key || '').toLowerCase() !== 't') return
      const el = document.activeElement as HTMLElement | null
      const tag = (el?.tagName || '').toUpperCase()
      const isTyping = !!(
        el && (
          el.isContentEditable ||
          tag === 'TEXTAREA' ||
          (tag === 'INPUT' && (el as HTMLInputElement).type !== 'checkbox' && (el as HTMLInputElement).type !== 'button')
        )
      )
      if (isTyping) return
      e.preventDefault()
      if (!modalSubjectContext.basePath) {
        showToastMessage('error', 'Navega hasta una materia antes de sincronizar')
        return
      }
      setShowMoodleModal(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [modalSubjectContext.basePath, showToastMessage])

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
            <p>Buscando configuraciÃ³n previa...</p>
          </main>
        )
      }
    }
  }

  const daysUntil = (pdf: PdfFile) => {
    const dayMap: Record<string, number> = {
      Lunes: 1,
      Martes: 2,
      MiÃ©rcoles: 3,
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
      const canonical =
        canonicalSubjects.find((s) => normalizeKey(s) === normalizeKey(currentPdf.subject)) ||
        currentPdf.subject
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

  const fallbackDir: DirectoryEntry = {
    path: "",
    name: "",
    parent: null,
    subdirs: [],
    files: [],
  }
  const currentDirEntry =
    (viewWeek ? directoryTree[viewWeek] : directoryTree[""]) ?? fallbackDir
  const childDirectories = currentDirEntry.subdirs
  const selectedFiles = currentDirEntry.files
  const parentDirectory = currentDirEntry.parent

  const currentSubjectContext = useMemo(
    () => extractSubjectContext(currentDirEntry.path || currentPath),
    [currentDirEntry.path, currentPath],
  )
  const isSubjectView = useMemo(() => {
    const basePath = currentSubjectContext.basePath
    if (!basePath) return false
    const segments = basePath.split('/').filter(Boolean)
    if (!segments.length) return false
    const requiresWeek = normalizeKey(segments[0]).startsWith('semana')
    if (requiresWeek && segments.length < 2) return false
    if (currentDirEntry.path === basePath) return true
    return currentDirEntry.path.startsWith(`${basePath}/`)
  }, [currentSubjectContext.basePath, currentDirEntry.path])
  const theoryFilesForSubject = useMemo(
    () => collectCategoryFiles(currentSubjectContext.basePath, 'theory'),
    [collectCategoryFiles, currentSubjectContext.basePath],
  )
  const practiceFilesForSubject = useMemo(
    () => collectCategoryFiles(currentSubjectContext.basePath, 'practice'),
    [collectCategoryFiles, currentSubjectContext.basePath],
  )
  const categoryDirSet = useMemo(() => {
    const set = new Set<string>()
    const basePath = currentSubjectContext.basePath
    if (!basePath) return set
    const entry = directoryTree[basePath]
    if (!entry) return set
    entry.subdirs.forEach((dir) => {
      const last = dir.split('/').filter(Boolean).pop() || ''
      if (matchesCategorySegment(last, 'theory') || matchesCategorySegment(last, 'practice')) {
        set.add(dir)
      }
    })
    return set
  }, [currentSubjectContext.basePath, directoryTree])
  const nonCategoryDirectories = childDirectories.filter((dir) => !categoryDirSet.has(dir))

  const subjectConfigs = useMemo(
    () =>
      moodleFolders.filter((item) =>
        item.subjectKey === modalSubjectContext.subjectKey && !!modalSubjectContext.subjectKey,
      ),
    [moodleFolders, modalSubjectContext.subjectKey],
  )
  const otherConfigs = useMemo(
    () =>
      moodleFolders.filter((item) => item.subjectKey !== modalSubjectContext.subjectKey),
    [moodleFolders, modalSubjectContext.subjectKey],
  )
  const theoryConfigForCurrent = subjectConfigs.find(
    (item) => item.basePath === modalSubjectContext.basePath && item.category === 'theory',
  )
  const practiceConfigForCurrent = subjectConfigs.find(
    (item) => item.basePath === modalSubjectContext.basePath && item.category === 'practice',
  )

  const groupedSubjectConfigs = useMemo(() => {
    const map = new Map<string, MoodleFolderConfig[]>()
    subjectConfigs.forEach((cfg) => {
      const existing = map.get(cfg.basePath) || []
      existing.push(cfg)
      map.set(cfg.basePath, existing)
    })
    return Array.from(map.entries())
  }, [subjectConfigs])

  const groupedOtherConfigs = useMemo(() => {
    const map = new Map<string, MoodleFolderConfig[]>()
    otherConfigs.forEach((cfg) => {
      const existing = map.get(cfg.basePath) || []
      existing.push(cfg)
      map.set(cfg.basePath, existing)
    })
    return Array.from(map.entries())
  }, [otherConfigs])

  const formatBreadcrumb = (path: string | null) => {
    if (!path) return 'Inicio'
    const segments = path.split('/').filter(Boolean)
    return segments.length ? segments.join(' / ') : 'Inicio'
  }

  const formatDirLabel = (path: string) => {
    const segments = path.split('/')
    const clean = segments.filter(Boolean)
    return clean.length ? clean[clean.length - 1] : path || 'Inicio'
  }

  const renderFileList = (files: PdfFile[]) => (
    <ul className="space-y-1">
      {files.map((p) => (
        <li
          key={p.path}
          className={`flex items-center gap-2 ${
            completed[p.path] ? 'line-through text-gray-400' : ''
          }`}
        >
          <span
            className="flex-1 truncate cursor-pointer"
            title={p.file.name}
            onClick={() => handleSelectFile(p)}
          >
            {p.file.name}
            {p.mediaType === 'video' && (
              <span className="ml-2 text-xs text-indigo-500 uppercase">Video</span>
            )}
          </span>
        </li>
      ))}
    </ul>
  )

  // main interface
  return (
    <>
      <main className="flex flex-col md:grid md:grid-cols-2 min-h-screen">
        <aside className="border-b md:border-r p-4 space-y-2">
          {viewWeek !== null && (
            <div className="mb-2 flex flex-wrap gap-2">
              <button className="underline" onClick={() => setViewWeek(null)}>
                Inicio
              </button>
              {parentDirectory !== null && (
                <button
                  className="underline"
                  onClick={() => setViewWeek(parentDirectory || null)}
                >
                  â† Volver
                </button>
              )}
            </div>
          )}
          <h2 className="text-xl">{formatBreadcrumb(viewWeek)}</h2>
          {nonCategoryDirectories.length > 0 && (
            <ul className="space-y-1">
              {nonCategoryDirectories.map((dir) => (
                <li key={dir} className="font-bold">
                  <button onClick={() => setViewWeek(dir)}>{formatDirLabel(dir)}</button>
                </li>
              ))}
            </ul>
          )}
          {isSubjectView ? (
            <div className="space-y-3">
              <div>
                <h3 className="text-sm font-semibold uppercase text-gray-500">Teoria</h3>
                {theoryFilesForSubject.length
                  ? renderFileList(theoryFilesForSubject)
                  : <p className="text-sm text-gray-500">Sin archivos de teoria</p>}
              </div>
              <div>
                <h3 className="text-sm font-semibold uppercase text-gray-500">Practica</h3>
                {practiceFilesForSubject.length
                  ? renderFileList(practiceFilesForSubject)
                  : <p className="text-sm text-gray-500">Sin archivos de practica</p>}
              </div>
            </div>
          ) : selectedFiles.length > 0 ? (
            <div className={nonCategoryDirectories.length > 0 ? 'space-y-1' : ''}>
              {nonCategoryDirectories.length > 0 && (
                <h3 className="text-sm font-semibold text-gray-500 uppercase">Archivos</h3>
              )}
              {renderFileList(selectedFiles)}
            </div>
          ) : (
            nonCategoryDirectories.length === 0 && (
              <p className="text-sm text-gray-500">Carpeta vacia</p>
            )
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
                    DÃ­as restantes: {currentPdf ? daysUntil(currentPdf) : ''}
                  </span>
                  <button
                    onClick={() =>
                      viewerRef.current?.contentWindow?.postMessage(
                        { type: 'toggleFullscreen' },
                        '*'
                      )
                    }
                  >
                    {pdfFullscreen ? 'ðŸ——' : 'â›¶'}
                  </button>
                  <button
                    onClick={() => {
                      setTheme(theme === 'light' ? 'dark' : 'light')
                    }}
                  >
                    {theme === 'light' ? 'ðŸŒž' : 'ðŸŒ™'}
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
                    âœ•
                  </button>
                  {/* <span>Hoy: {formatHM(todaySeconds)}</span> */}
                </div>
              </div>
            )
          ) : (
            <div className="flex flex-wrap items-center justify-between p-2 border-b gap-2">
              <div className="flex items-center gap-2">
                <span>ðŸ“„</span>
                <span
                  className="truncate"
                  title={currentPdf ? currentPdf.file.name : 'Sin selecciÃ³n'}
                >
                  {currentPdf ? currentPdf.file.name : 'Sin selecciÃ³n'}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button onClick={prevPdf} disabled={queueIndex <= 0}>
                  â†
                </button>
                <button onClick={nextPdf} disabled={queueIndex >= queue.length - 1}>
                  â†’
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
            {currentPdf ? (
              currentPdf.mediaType === 'video' && videoUrl ? (
                <video
                  key={videoUrl}
                  controls
                  className="w-full h-full"
                  src={videoUrl}
                >
                  Tu navegador no soporta la reproducciÃ³n de video.
                </video>
              ) : currentPdf.isPdf && pdfUrl ? (
                <iframe
                  ref={viewerRef}
                  onLoad={() =>
                    viewerRef.current?.contentWindow?.postMessage(
                      { type: 'setTheme', theme },
                      '*',
                    )
                  }
                  title={viewerOpen ? 'Visor PDF' : 'PrevisualizaciÃ³n'}
                  src={`/visor/index.html?url=${encodeURIComponent(pdfUrl!)}&name=${encodeURIComponent(
                    currentPdf.file.name,
                  )}&key=${encodeURIComponent(currentPdf.path)}`}
                  className="w-full h-full border-0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              ) : embedUrl ? (
                <iframe
                  ref={viewerRef}
                  onLoad={() =>
                    viewerRef.current?.contentWindow?.postMessage(
                      { type: 'setTheme', theme },
                      '*',
                    )
                  }
                  title={viewerOpen ? 'Visor' : 'PrevisualizaciÃ³n'}
                  src={embedUrl}
                  className="w-full h-full border-0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-sm text-gray-500">
                  Selecciona un archivo
                </div>
              )
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
      <button onClick={() => setShowSettings(!showSettings)}>âš™ï¸</button>
      {showSettings && (
        <div className="absolute right-0 mt-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-2 space-y-2 text-sm text-gray-800 dark:text-gray-200">
          <button className="block w-full text-left" onClick={selectDirectory}>Reseleccionar carpeta</button>
          <button className="block w-full text-left" onClick={() => setShowDarkModal(true)}>Configurar modo oscuro</button>
        </div>
      )}
    </div>

    {showMoodleModal && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div className="bg-white dark:bg-gray-800 w-full max-w-2xl mx-4 p-4 rounded shadow space-y-4 text-gray-800 dark:text-gray-200">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Sincronizar Moodle</h2>
            <button onClick={() => setShowMoodleModal(false)} className="text-sm underline">Cerrar</button>
          </div>
          <div className="text-sm text-gray-600 dark:text-gray-400">
            Carpeta actual: {formatBreadcrumb(modalSubjectContext.basePath || viewWeek)}
          </div>
          <label className="flex flex-col gap-1 text-sm">
            Token Moodle
            <input
              type="password"
              value={moodleToken}
              onChange={(e) => setMoodleToken(e.target.value)}
              className="border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-transparent"
              placeholder="Ingresa tu token"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Curso ID
            <input
              value={courseInput}
              onChange={(e) => setCourseInput(e.target.value)}
              className="border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-transparent"
              placeholder="Ej: 1881"
              inputMode="numeric"
            />
          </label>
          {moodleError && <div className="text-sm text-red-500">{moodleError}</div>}
          <p className="text-xs text-gray-500 dark:text-gray-400">El mismo curso se reutiliza para todas las semanas de una materia.</p>
          <div className="grid gap-3 md:grid-cols-2">
            <section className="space-y-2 border border-gray-200 dark:border-gray-700 rounded p-3">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-sm">Teoria</span>
                {theoryConfigForCurrent?.lastSynced && (
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    Ultima descarga: {new Date(theoryConfigForCurrent.lastSynced).toLocaleString()}
                  </span>
                )}
              </div>
              <label className="flex flex-col gap-1 text-sm">
                Folder ID
                <input
                  value={theoryFolderInput}
                  onChange={(e) => setTheoryFolderInput(e.target.value)}
                  className="border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-transparent"
                  placeholder="ID carpeta teoria"
                  inputMode="numeric"
                />
              </label>
              <div className="flex gap-2">
                <button
                  onClick={() => handleCategorySync('theory')}
                  className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded text-sm"
                  disabled={!!syncingFolderId}
                >
                  {syncingFolderId ? 'Descargando...' : 'Descargar'}
                </button>
                {theoryConfigForCurrent && (
                  <button
                    onClick={() => handleClearCategory('theory')}
                    className="px-3 py-1 border border-red-400 text-red-500 rounded text-sm"
                    disabled={!!syncingFolderId}
                  >
                    Limpiar
                  </button>
                )}
              </div>
            </section>
            <section className="space-y-2 border border-gray-200 dark:border-gray-700 rounded p-3">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-sm">Practica</span>
                {practiceConfigForCurrent?.lastSynced && (
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    Ultima descarga: {new Date(practiceConfigForCurrent.lastSynced).toLocaleString()}
                  </span>
                )}
              </div>
              <label className="flex flex-col gap-1 text-sm">
                Folder ID
                <input
                  value={practiceFolderInput}
                  onChange={(e) => setPracticeFolderInput(e.target.value)}
                  className="border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-transparent"
                  placeholder="ID carpeta practica"
                  inputMode="numeric"
                />
              </label>
              <div className="flex gap-2">
                <button
                  onClick={() => handleCategorySync('practice')}
                  className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded text-sm"
                  disabled={!!syncingFolderId}
                >
                  {syncingFolderId ? 'Descargando...' : 'Descargar'}
                </button>
                {practiceConfigForCurrent && (
                  <button
                    onClick={() => handleClearCategory('practice')}
                    className="px-3 py-1 border border-red-400 text-red-500 rounded text-sm"
                    disabled={!!syncingFolderId}
                  >
                    Limpiar
                  </button>
                )}
              </div>
            </section>
          </div>
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">Guardados de esta materia</h3>
            {groupedSubjectConfigs.length ? (
              <ul className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {groupedSubjectConfigs.map(([base, configs]) => (
                  <li
                    key={base}
                    className="border border-gray-200 dark:border-gray-700 rounded p-2 space-y-1 text-sm"
                  >
                    <div className="font-medium">{formatBreadcrumb(base)}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">Curso: {configs[0]?.courseId || '-'}</div>
                    <div className="flex flex-wrap gap-2 pt-1">
                      {configs.map((cfg) => (
                        <div
                          key={cfg.id}
                          className="flex items-center gap-2 border border-gray-200 dark:border-gray-600 rounded px-2 py-1 text-xs"
                        >
                          <span>{cfg.category === 'theory' ? 'Teoria' : 'Practica'} Â -  Folder {cfg.folderId}</span>
                          <button
                            className="text-red-500"
                            onClick={() => handleRemoveMoodleConfig(cfg)}
                          >
                            Eliminar
                          </button>
                        </div>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400">Aun no hay IDs guardados para esta materia.</p>
            )}
          </div>
          {groupedOtherConfigs.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">Otras materias</h3>
              <ul className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {groupedOtherConfigs.map(([base, configs]) => (
                  <li
                    key={base}
                    className="border border-gray-200 dark:border-gray-700 rounded p-2 space-y-1 text-sm"
                  >
                    <div className="font-medium">{formatBreadcrumb(base)}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">Curso: {configs[0]?.courseId || '-'}</div>
                    <div className="flex flex-wrap gap-2 pt-1">
                      {configs.map((cfg) => (
                        <div
                          key={cfg.id}
                          className="flex items-center gap-2 border border-gray-200 dark:border-gray-600 rounded px-2 py-1 text-xs"
                        >
                          <span>{cfg.category === 'theory' ? 'Teoria' : 'Practica'} Â -  Folder {cfg.folderId}</span>
                          <button
                            className="text-red-500"
                            onClick={() => handleRemoveMoodleConfig(cfg)}
                          >
                            Eliminar
                          </button>
                        </div>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    )


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
                <span>â†“</span>
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













