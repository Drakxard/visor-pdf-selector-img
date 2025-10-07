"use client"

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTheme } from "next-themes"
import { usePathname, useRouter } from "next/navigation"

const days = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"]

const normalizeSegment = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()

const isTheorySegment = (segment: string) => {
  const normalized = normalizeSegment(segment)
  return normalized === "teoria" || normalized === "theory"
}

const isPracticeSegment = (segment: string) => {
  const normalized = normalizeSegment(segment)
  return normalized === "practica" || normalized === "practice"
}

const getLastSegment = (path: string) => {
  const parts = path.split("/").filter(Boolean)
  return parts.length ? parts[parts.length - 1] : ""
}

const extractSubjectPath = (path: string) => {
  const segments = path.split("/").filter(Boolean)
  if (!segments.length) return ""
  if (segments.length === 1) return segments[0]
  let endIndex = segments.length
  for (let i = segments.length - 1; i >= 0; i--) {
    if (isTheorySegment(segments[i]) || isPracticeSegment(segments[i])) {
      endIndex = i
      break
    }
  }
  if (endIndex <= 0) return segments.join("/")
  return segments.slice(0, endIndex).join("/") || segments.join("/")
}

const extractSubjectName = (path: string) => {
  const subjectPath = extractSubjectPath(path)
  const parts = subjectPath.split("/").filter(Boolean)
  return parts.length ? parts[parts.length - 1] : ""
}

const isQuotaExceededError = (error: unknown) =>
  error instanceof DOMException &&
  (error.name === "QuotaExceededError" || error.name === "NS_ERROR_DOM_QUOTA_REACHED")

const setStoredItem = (key: string, value: string | null | undefined) => {
  if (value === null || value === undefined) {
    try {
      localStorage.removeItem(key)
    } catch (error) {
      if (!isQuotaExceededError(error)) {
        console.warn(`localStorage.removeItem failed for ${key}`, error)
      }
    }
    try {
      sessionStorage.removeItem(key)
    } catch (error) {
      console.warn(`sessionStorage.removeItem failed for ${key}`, error)
    }
    return
  }

  try {
    localStorage.setItem(key, value)
    try {
      sessionStorage.removeItem(key)
    } catch {}
    return
  } catch (error) {
    if (isQuotaExceededError(error)) {
      console.warn(`localStorage quota exceeded while storing ${key}`, error)
    } else {
      console.warn(`localStorage.setItem failed for ${key}`, error)
    }
  }

  try {
    localStorage.removeItem(key)
  } catch {}

  try {
    sessionStorage.setItem(key, value)
  } catch (error) {
    console.warn(`sessionStorage.setItem failed for ${key}`, error)
  }
}

const getStoredItem = (key: string) => {
  try {
    const value = localStorage.getItem(key)
    if (value !== null) return value
  } catch (error) {
    console.warn(`localStorage.getItem failed for ${key}`, error)
  }

  try {
    return sessionStorage.getItem(key)
  } catch (error) {
    console.warn(`sessionStorage.getItem failed for ${key}`, error)
    return null
  }
}

type PdfFile = {
  file: File
  path: string
  week: string
  subject: string
  tableType: "theory" | "practice"
  isPdf: boolean
  url?: string
  mediaType?: 'pdf' | 'video' | 'link'
  containerPath?: string
}

type DirectoryEntry = {
  path: string
  name: string
  parent: string | null
  subdirs: string[]
  files: PdfFile[]
}

type QuickLink = {
  id: string
  label: string
  url: string
}

const QUICK_LINK_SLOT_COUNT = 6

const DEFAULT_SUBJECT_QUICK_LINKS: QuickLink[] = [
  {
    id: "default-teoria-algebra",
    label: "Teoría · Álgebra",
    url: "/teoria/algebra",
  },
  {
    id: "default-practica-algebra",
    label: "Práctica · Álgebra",
    url: "/practica/algebra",
  },
  {
    id: "default-teoria-calculo",
    label: "Teoría · Cálculo",
    url: "/teoria/calculo",
  },
  {
    id: "default-practica-calculo",
    label: "Práctica · Cálculo",
    url: "/practica/calculo",
  },
  {
    id: "default-teoria-poo",
    label: "Teoría · POO",
    url: "/teoria/poo",
  },
  {
    id: "default-practica-poo",
    label: "Práctica · POO",
    url: "/practica/poo",
  },
]

const normalizeQuickLinks = (raw: unknown, prefix = 'link'): QuickLink[] => {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const result: QuickLink[] = []
  raw.forEach((item, index) => {
    if (typeof item === 'string') {
      const url = item.trim()
      if (!url) return
      const key = url.toLowerCase()
      if (seen.has(key)) return
      seen.add(key)
      result.push({ id: `${prefix}-${index}`, label: url, url })
      return
    }
    if (!item || typeof item !== 'object') return
    const obj = item as Record<string, unknown>
    const rawUrlValue =
      typeof obj['url'] === 'string'
        ? (obj['url'] as string).trim()
        : typeof obj['href'] === 'string'
          ? (obj['href'] as string).trim()
          : ''
    if (!rawUrlValue) return
    const key = rawUrlValue.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    const labelValue =
      typeof obj['label'] === 'string' && (obj['label'] as string).trim()
        ? (obj['label'] as string).trim()
        : typeof obj['name'] === 'string' && (obj['name'] as string).trim()
          ? (obj['name'] as string).trim()
          : typeof obj['title'] === 'string' && (obj['title'] as string).trim()
            ? (obj['title'] as string).trim()
            : ''
    const idValue =
      typeof obj['id'] === 'string' && (obj['id'] as string).trim()
        ? (obj['id'] as string).trim()
        : `${prefix}-${index}`
    result.push({ id: idValue, label: (labelValue || rawUrlValue), url: rawUrlValue })
  })
  return result.slice(0, QUICK_LINK_SLOT_COUNT)
}
type MoodleFolderConfig = {
  id: string
  courseId: number
  folderId: number
  path: string
  name?: string
  lastSynced?: string
}

type MoodleTargetOption = {
  type: "theory" | "practice"
  path: string
}

const buildTargetPath = (basePath: string, segment: string) => {
  if (!basePath) return segment
  const normalized = basePath.endsWith("/") ? basePath.slice(0, -1) : basePath
  return `${normalized}/${segment}`
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
      if (handle.kind === "file") {
        const file = await handle.getFile()
        const rel = relativePath ? `${relativePath}/${name}` : name
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
  await traverse(dir, "")
  return { files, directories: Array.from(directories) }
}

const getDirectoryHandleForPath = async (
  root: FileSystemDirectoryHandle,
  path: string,
) => {
  if (!path) return root
  const segments = path.split('/').filter(Boolean)
  let current = root
  for (const segment of segments) {
    current = await current.getDirectoryHandle(segment, { create: true })
  }
  return current
}

export default function Home() {
  const { setTheme, theme } = useTheme()
  const router = useRouter()
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
  const [quickLinks, setQuickLinks] = useState<QuickLink[]>([])
  const [showQuickLinks, setShowQuickLinks] = useState(false)
  const [showMoodleModal, setShowMoodleModal] = useState(false)
  const [showMoodleTargetPicker, setShowMoodleTargetPicker] = useState(false)
  const [moodleToken, setMoodleToken] = useState<string>(process.env.NEXT_PUBLIC_MOODLE_TOKEN || '')
  const [moodleFolders, setMoodleFolders] = useState<MoodleFolderConfig[]>([])
  const [syncingFolderId, setSyncingFolderId] = useState<string | null>(null)
  const [moodleError, setMoodleError] = useState<string | null>(null)
  const [showAddFolderForm, setShowAddFolderForm] = useState(false)
  const [newCourseId, setNewCourseId] = useState('')
  const [newFolderId, setNewFolderId] = useState('')
  const [newFolderName, setNewFolderName] = useState('')
  const [moodleTargetPath, setMoodleTargetPath] = useState<string | null>(null)
  const [moodleTargetOptions, setMoodleTargetOptions] = useState<MoodleTargetOption[]>([])
  const showToastMessage = useCallback((type: 'success' | 'error', text: string) => {
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current)
    setToast({ type, text })
    toastTimerRef.current = window.setTimeout(() => setToast(null), 3000)
  }, [])
  const handleChooseMoodleTarget = useCallback((option: MoodleTargetOption) => {
    setMoodleTargetPath(option.path)
    setMoodleTargetOptions([])
    setShowMoodleTargetPicker(false)
    setShowMoodleModal(true)
  }, [])
  const handleDismissMoodleTargetPicker = useCallback(() => {
    setMoodleTargetOptions([])
    setShowMoodleTargetPicker(false)
  }, [])
  const findCourseIdForSubject = useCallback(
    (subject: string | null) => {
      if (!subject) return null
      const normalizedTarget = normalizeSegment(subject)
      for (const config of moodleFolders) {
        const configSubject = extractSubjectName(config.path || '')
        if (!configSubject) continue
        if (normalizeSegment(configSubject) === normalizedTarget) {
          return config.courseId
        }
      }
      return null
    },
    [moodleFolders],
  )
  // const autoPausedRef = useRef(false)
  const [restored, setRestored] = useState(false)
  const pathname = usePathname()
  const routeScope = useMemo(() => {
    const rawPath = pathname ?? ''
    const segments = rawPath.split('/')
      .filter(Boolean)
      .map((segment) => decodeURIComponent(segment))
    if (segments.length >= 2) {
      const [modeSegment, subjectSegment] = segments
      if (isTheorySegment(modeSegment) && subjectSegment) {
        return {
          scope: 'subject' as const,
          tableType: 'theory' as const,
          subject: subjectSegment,
          normalizedSubject: normalizeSegment(subjectSegment),
        }
      }
      if (isPracticeSegment(modeSegment) && subjectSegment) {
        return {
          scope: 'subject' as const,
          tableType: 'practice' as const,
          subject: subjectSegment,
          normalizedSubject: normalizeSegment(subjectSegment),
        }
      }
    }
    return { scope: 'global' as const }
  }, [pathname])

  const getScopedStorageKey = useCallback(
    (baseKey: string) => {
      if (routeScope.scope === 'subject') {
        return `${baseKey}::${routeScope.tableType}::${routeScope.normalizedSubject}`
      }
      return baseKey
    },
    [routeScope],
  )

  const getScopedStoredItem = useCallback(
    (baseKey: string) => {
      const scopedKey = getScopedStorageKey(baseKey)
      const scopedValue = getStoredItem(scopedKey)
      if (scopedValue !== null) return scopedValue
      if (routeScope.scope === 'subject') {
        return getStoredItem(baseKey)
      }
      return null
    },
    [getScopedStorageKey, routeScope],
  )

  const setScopedStoredItem = useCallback(
    (baseKey: string, value: string | null | undefined) => {
      const scopedKey = getScopedStorageKey(baseKey)
      setStoredItem(scopedKey, value)
    },
    [getScopedStorageKey],
  )

  const scopedLastPathKey = useMemo(
    () => getScopedStorageKey('lastPath'),
    [getScopedStorageKey],
  )

  useEffect(() => {
    setRestored(false)
  }, [scopedLastPathKey])

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

  const filterSystemEntries = (files: File[], directories: string[]) => {
    const isHidden = (segment: string) => segment.startsWith('.') || segment.toLowerCase() === 'system'
    const filteredFiles = files.filter((f) => {
      const rel = ((f as any).webkitRelativePath || '').split('/')
      return !rel.some((segment: string) => isHidden(segment))
    })
    const filteredDirs = directories.filter(
      (dir) => !dir.split('/').some((segment) => isHidden(segment))
    )
    return { files: filteredFiles, directories: filteredDirs }
  }

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
      const configLinks = normalizeQuickLinks(data.quickLinks ?? data.links ?? [], 'cfg')
      if (configLinks.length) {
        setQuickLinks(configLinks)
      }
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
      if (!moodleToken) {
        const message = 'Configura el token de Moodle'
        setMoodleError(message)
        return { ok: false as const, error: message }
      }
      setMoodleError(null)
      setSyncingFolderId(config.id)
      try {
        const resp = await fetch('/api/moodle/contents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            token: moodleToken,
            courseId: config.courseId,
          }),
        })
        const payload = await resp.json().catch(() => null)
        if (!resp.ok || !payload?.ok) {
          const message = payload?.error || `Error HTTP ${resp.status}`
          throw new Error(message)
        }
        const data = payload.data
        if (!Array.isArray(data)) {
          throw new Error('Respuesta inesperada del servidor')
        }
        let targetModule: any = null
        for (const section of data) {
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
        const dirHandle = await getDirectoryHandleForPath(rootHandle, config.path)
        if (!(await verifyPermission(dirHandle, 'readwrite'))) {
          throw new Error('Se requieren permisos de escritura en la carpeta destino')
        }
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
            body: JSON.stringify({ url: rawFileUrl, token: moodleToken }),
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
        }
        await refreshDirectory(rootHandle)
        return { ok: true as const, count: contents.length }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Error inesperado al descargar'
        setMoodleError(message)
        return { ok: false as const, error: message }
      } finally {
        setSyncingFolderId(null)
      }
    },
    [rootHandle, moodleToken, refreshDirectory],
  )

  const handleSyncExisting = useCallback(
    async (config: MoodleFolderConfig) => {
      const result = await handleSyncMoodleFolder(config)
      if (result.ok) {
        const timestamp = new Date().toISOString()
        setMoodleFolders((prev) =>
          prev.map((item) =>
            item.id === config.id ? { ...item, lastSynced: timestamp } : item,
          ),
        )
        showToastMessage('success', `Descargados ${result.count} archivos`)
        setMoodleError(null)
      } else {
        showToastMessage('error', result.error)
      }
    },
    [handleSyncMoodleFolder, showToastMessage],
  )

  const handleRemoveMoodleFolder = useCallback((id: string) => {
    setMoodleFolders((prev) => prev.filter((item) => item.id !== id))
  }, [])

  const handleAddMoodleFolder = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      const courseId = Number(newCourseId.trim())
      const folderId = Number(newFolderId.trim())
      if (!Number.isFinite(courseId) || courseId <= 0 || !Number.isFinite(folderId) || folderId <= 0) {
        const message = 'Ingresa IDs numericos validos'
        setMoodleError(message)
        showToastMessage('error', message)
        return
      }
      const pathTarget = (moodleTargetPath ?? viewWeek) ?? ''
      const existing = moodleFolders.find((item) => item.path === pathTarget)
      const generatedId =
        existing?.id ||
        (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(16).slice(2)}`)
      const configToSync: MoodleFolderConfig = {
        id: generatedId,
        courseId,
        folderId,
        path: pathTarget,
        name:
          newFolderName.trim() ||
          existing?.name ||
          (extractSubjectName(pathTarget) || undefined),
      }
      const result = await handleSyncMoodleFolder(configToSync)
      if (result.ok) {
        const timestamp = new Date().toISOString()
        setMoodleFolders((prev) => {
          const filtered = prev.filter((item) => item.path !== pathTarget)
          return [...filtered, { ...configToSync, lastSynced: timestamp }]
        })
        showToastMessage('success', `Descargados ${result.count} archivos`)
        setMoodleError(null)
        setShowAddFolderForm(false)
      } else {
        showToastMessage('error', result.error)
      }
    },
    [
      handleSyncMoodleFolder,
      moodleFolders,
      newCourseId,
      newFolderId,
      newFolderName,
      showToastMessage,
      viewWeek,
      moodleTargetPath,
    ],
  )

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
      if (configFound) setStoredItem("setupComplete", "1")
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
    const storedStart = parseInt(getStoredItem('darkModeStart') ?? '19')
    setDarkModeStart(storedStart)
    applyTheme(storedStart)
    const stored = getStoredItem("setupComplete")
    if (!stored) {
      setSetupComplete(false)
    }
  }, [setTheme])

  useEffect(() => {
    if (!mounted) return
    setStoredItem('darkModeStart', darkModeStart.toString())
    applyTheme(darkModeStart)
  }, [darkModeStart, mounted])

  useEffect(() => {
    const storedFolders = getStoredItem('moodleFolders')
    if (storedFolders) {
      try {
        const parsed = JSON.parse(storedFolders) as MoodleFolderConfig[]
        setMoodleFolders(parsed)
      } catch {}
    }
  }, [])

  useEffect(() => {
    if (!showMoodleModal) {
      setShowAddFolderForm(false)
      setMoodleError(null)
      setMoodleTargetPath(null)
      return
    }
    const pathTarget = (moodleTargetPath ?? viewWeek) ?? ''
    const existing = moodleFolders.find((cfg) => cfg.path === pathTarget)
    if (existing) {
      setNewCourseId(String(existing.courseId ?? ''))
      setNewFolderId(String(existing.folderId ?? ''))
      setNewFolderName(existing.name ?? extractSubjectName(pathTarget) ?? '')
    } else {
      const subjectName = extractSubjectName(pathTarget)
      const sharedCourseId = findCourseIdForSubject(subjectName)
      setNewCourseId(sharedCourseId ? String(sharedCourseId) : '')
      setNewFolderId('')
      setNewFolderName(subjectName || '')
    }
    setShowAddFolderForm(true)
    setMoodleError(null)
  }, [
    showMoodleModal,
    viewWeek,
    moodleTargetPath,
    moodleFolders,
    findCourseIdForSubject,
  ])

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
    const stored = getStoredItem("completed")
    if (stored) setCompleted(JSON.parse(stored))
  }, [])

  // load subjects from storage
  useEffect(() => {
    const storedNames = getStoredItem("names")
    if (storedNames) setNames(JSON.parse(storedNames))
    const storedTheory = getStoredItem("theory")
    if (storedTheory) setTheory(JSON.parse(storedTheory))
    const storedPractice = getStoredItem("practice")
    if (storedPractice) setPractice(JSON.parse(storedPractice))
  }, [])

  useEffect(() => {
    const storedQuickLinks = getStoredItem('quickLinks')
    if (!storedQuickLinks) return
    try {
      const parsed = JSON.parse(storedQuickLinks)
      const normalized = normalizeQuickLinks(parsed, 'stored')
      setQuickLinks(normalized)
    } catch {}
  }, [])

  // persist completed
  useEffect(() => {
    setStoredItem("completed", JSON.stringify(completed))
  }, [completed])

  useEffect(() => {
    setStoredItem("names", JSON.stringify(names))
  }, [names])

  useEffect(() => {
    setStoredItem("theory", JSON.stringify(theory))
  }, [theory])

  useEffect(() => {
    setStoredItem("practice", JSON.stringify(practice))
  }, [practice])

  useEffect(() => {
    if (!mounted) return
    setStoredItem('quickLinks', JSON.stringify(quickLinks))
  }, [quickLinks, mounted])

  useEffect(() => {
    if (!mounted) return
    setStoredItem('moodleFolders', JSON.stringify(moodleFolders))
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
      if (parts.some((segment) => !segment || segment.toLowerCase() === "system" || segment.startsWith('.'))) continue
      const dirPath = parts.slice(0, -1).join("/")
      const entry = ensureDir(dirPath)
      const nameLower = file.name.toLowerCase()
      const isPdf = nameLower.endsWith(".pdf")
      const isVideo = /\.(mp4|webm|ogg|mov|mkv)$/.test(nameLower)
      if (!isPdf && !isVideo) continue
      const mediaType = isPdf ? 'pdf' : 'video'
      const containerPath = dirPath
      const subjectPath = extractSubjectPath(dirPath)
      const subjectName = extractSubjectName(dirPath)
      let tableType: "theory" | "practice" = 'theory'
      const dirSegments = dirPath.split('/').filter(Boolean)
      for (let i = dirSegments.length - 1; i >= 0; i--) {
        if (isPracticeSegment(dirSegments[i])) {
          tableType = 'practice'
          break
        }
        if (isTheorySegment(dirSegments[i])) {
          tableType = 'theory'
          break
        }
      }
      const item: PdfFile = {
        file,
        path: parts.join("/"),
        week: subjectPath || dirPath,
        subject: subjectName,
        tableType,
        isPdf,
        mediaType,
        containerPath,
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

  useEffect(() => {
    if (!viewWeek) return
    const lastSegment = getLastSegment(viewWeek)
    if (isTheorySegment(lastSegment) || isPracticeSegment(lastSegment)) {
      const parent = viewWeek.split('/').filter(Boolean).slice(0, -1).join('/')
      if (parent !== viewWeek) {
        setViewWeek(parent || null)
      }
    }
  }, [viewWeek, setViewWeek])

  // restore last opened file when queue is ready
  useEffect(() => {
    if (!restored && queue.length) {
      const last = getScopedStoredItem('lastPath')
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
  }, [queue, restored, getScopedStoredItem])

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
      setScopedStoredItem('lastPath', currentPdf.path)
      setScopedStoredItem('lastWeek', currentPdf.week)
      setScopedStoredItem('lastSubject', currentPdf.subject)
    }
  }, [currentPdf, setScopedStoredItem])

  // listen for messages from the PDF viewer
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === 'viewerFullscreen') {
        setPdfFullscreen(!!e.data.value)
      }
      if (e.data?.type === 'viewerPage') {
        setScopedStoredItem('lastPage', String(e.data.page))
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
  }, [currentPdf, pdfUrl, setScopedStoredItem])

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
      if (isTyping || showMoodleModal || showMoodleTargetPicker) return
      e.preventDefault()
      const currentPath = viewWeek ?? ''
      const entry = directoryTree[currentPath]
      if (!entry) {
        setMoodleTargetPath(currentPath)
        setShowMoodleModal(true)
        return
      }
      const findByType = (type: 'theory' | 'practice') =>
        entry.subdirs.find((dir) =>
          type === 'theory'
            ? isTheorySegment(getLastSegment(dir))
            : isPracticeSegment(getLastSegment(dir)),
        )
      const theoryPath = findByType('theory') ?? buildTargetPath(entry.path, 'Teoria')
      const practicePath = findByType('practice') ?? buildTargetPath(entry.path, 'Practica')
      const rawOptions: MoodleTargetOption[] = []
      if (theoryPath) rawOptions.push({ type: 'theory', path: theoryPath })
      if (practicePath) rawOptions.push({ type: 'practice', path: practicePath })
      const options = rawOptions.filter(
        (option, index, arr) => arr.findIndex((item) => item.path === option.path) === index,
      )
      if (options.length <= 1) {
        const target = options[0] ?? { type: 'theory', path: buildTargetPath(entry.path, 'Teoria') }
        setMoodleTargetPath(target.path)
        setShowMoodleModal(true)
        return
      }
      setMoodleTargetOptions(options)
      setShowMoodleTargetPicker(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [directoryTree, showMoodleModal, showMoodleTargetPicker, viewWeek])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const key = (e.key || '').toLowerCase()
      if (key === 'escape' && showQuickLinks) {
        e.preventDefault()
        setShowQuickLinks(false)
        return
      }
      if (key !== 'h') return
      const el = document.activeElement as HTMLElement | null
      const tag = (el?.tagName || '').toUpperCase()
      const isTyping = !!(
        el && (
          el.isContentEditable ||
          tag === 'TEXTAREA' ||
          (tag === 'INPUT' && (el as HTMLInputElement).type !== 'checkbox' && (el as HTMLInputElement).type !== 'button')
        )
      )
      if (isTyping || showMoodleModal || showMoodleTargetPicker) return
      e.preventDefault()
      setShowQuickLinks((prev) => !prev)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showQuickLinks, showMoodleModal, showMoodleTargetPicker])

  const quickLinkSlots = useMemo(() => {
    const source = quickLinks.length ? quickLinks : DEFAULT_SUBJECT_QUICK_LINKS
    const filled = source.slice(0, QUICK_LINK_SLOT_COUNT)
    const missing = QUICK_LINK_SLOT_COUNT - filled.length
    if (missing > 0) {
      const placeholders: QuickLink[] = []
      for (let i = 0; i < missing; i += 1) {
        placeholders.push({ id: `empty-${i}`, label: '', url: '' })
      }
      return [...filled, ...placeholders]
    }
    return filled
  }, [quickLinks])

  const openQuickLink = useCallback(
    (link: QuickLink) => {
      const rawUrl = (link.url || '').trim()
      if (!rawUrl) return
      let handled = false
      if (rawUrl.startsWith('/')) {
        router.push(rawUrl)
        handled = true
      } else {
        try {
          const resolved = new URL(rawUrl, window.location.href)
          if (resolved.origin === window.location.origin) {
            router.push(`${resolved.pathname}${resolved.search}${resolved.hash}`)
            handled = true
          }
        } catch {}
      }
      if (!handled) {
        try {
          window.open(rawUrl, '_blank', 'noopener,noreferrer')
        } catch {}
      }
      setShowQuickLinks(false)
    },
    [router],
  )

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
  const activeMoodlePath = (moodleTargetPath ?? viewWeek) ?? ''

  const collectFiles = (path: string): PdfFile[] => {
    const entry = directoryTree[path]
    if (!entry) return []
    const nested = entry.subdirs.flatMap((sub) => collectFiles(sub))
    return [...entry.files, ...nested]
  }

  const theoryChildPaths = childDirectories.filter((dir) =>
    isTheorySegment(getLastSegment(dir)),
  )
  const practiceChildPaths = childDirectories.filter((dir) =>
    isPracticeSegment(getLastSegment(dir)),
  )
  const aggregatedChildSet = new Set([...theoryChildPaths, ...practiceChildPaths])
  const otherChildDirectories = childDirectories.filter(
    (dir) => !aggregatedChildSet.has(dir),
  )

  const directTheoryFiles = selectedFiles.filter(
    (file) => file.tableType === 'theory',
  )
  const directPracticeFiles = selectedFiles.filter(
    (file) => file.tableType === 'practice',
  )

  const collectAndSort = (paths: string[], direct: PdfFile[]) => {
    const combined = [...direct, ...paths.flatMap((path) => collectFiles(path))]
    return combined.sort((a, b) =>
      a.file.name.localeCompare(b.file.name, undefined, {
        numeric: true,
        sensitivity: 'base',
      }),
    )
  }

  const theoryFiles = collectAndSort(theoryChildPaths, directTheoryFiles)
  const practiceFiles = collectAndSort(practiceChildPaths, directPracticeFiles)
  const currentDepth = (viewWeek?.split('/').filter(Boolean).length ?? 0)
  const showTheoryPractice =
    currentDepth >= 2 &&
    (theoryFiles.length > 0 || practiceFiles.length > 0 || aggregatedChildSet.size > 0)

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

  const formatDirLabel = (path: string) => {
    const segments = path.split("/").filter(Boolean)
    const name = segments.length ? segments[segments.length - 1] : path || "Inicio"
    const entry = directoryTree[path]
    if (!entry) return name
    const extras: string[] = []
    if (entry.subdirs.length > 0) {
      extras.push(
        `${entry.subdirs.length} ${
          entry.subdirs.length === 1 ? 'carpeta' : 'carpetas'
        }`,
      )
    }
    const videoCount = entry.files.filter((file) => file.mediaType === 'video').length
    if (videoCount > 0) {
      extras.push(`${videoCount} video${videoCount === 1 ? '' : 's'}`)
    }
    return extras.length ? `${name} · ${extras.join(' · ')}` : name
  }

  const formatBreadcrumb = (path: string | null) => {
    if (!path) return "Carpetas"
    const segments = path.split("/").filter(Boolean)
    return segments.length ? segments.join(" / ") : "Carpetas"
  }

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
                  ← Volver
                </button>
              )}
            </div>
          )}
          <h2 className="text-xl">{formatBreadcrumb(viewWeek)}</h2>
          {otherChildDirectories.length > 0 && (
            <ul className="space-y-1">
              {otherChildDirectories.map((dir) => (
                <li key={dir} className="font-bold">
                  <button onClick={() => setViewWeek(dir)}>
                    {formatDirLabel(dir)}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {showTheoryPractice ? (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-gray-500 uppercase">Teoría</h3>
                {theoryFiles.length ? (
                  renderFileList(theoryFiles)
                ) : (
                  <p className="text-xs text-gray-500">Sin archivos</p>
                )}
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-500 uppercase">Práctica</h3>
                {practiceFiles.length ? (
                  renderFileList(practiceFiles)
                ) : (
                  <p className="text-xs text-gray-500">Sin archivos</p>
                )}
              </div>
            </div>
          ) : selectedFiles.length > 0 ? (
            <div className={childDirectories.length > 0 ? "space-y-1" : ""}>
              {childDirectories.length > 0 && (
                <h3 className="text-sm font-semibold text-gray-500 uppercase">
                  Archivos
                </h3>
              )}
              {renderFileList(selectedFiles)}
            </div>
          ) : null}
          {(showTheoryPractice
            ? theoryFiles.length === 0 &&
              practiceFiles.length === 0 &&
              otherChildDirectories.length === 0
            : childDirectories.length === 0 && selectedFiles.length === 0) && (
            <p className="text-sm text-gray-500">Carpeta vacía</p>
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
            {currentPdf ? (
              currentPdf.mediaType === 'video' && videoUrl ? (
                <video
                  key={videoUrl}
                  controls
                  className="w-full h-full"
                  src={videoUrl}
                >
                  Tu navegador no soporta la reproducción de video.
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
                  title={viewerOpen ? 'Visor PDF' : 'Previsualización'}
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
                  title={viewerOpen ? 'Visor' : 'Previsualización'}
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
      <button onClick={() => setShowSettings(!showSettings)}>⚙️</button>
      {showSettings && (
        <div className="absolute right-0 mt-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-2 space-y-2 text-sm text-gray-800 dark:text-gray-200">
          <button className="block w-full text-left" onClick={selectDirectory}>Reseleccionar carpeta</button>
          <button className="block w-full text-left" onClick={() => setShowDarkModal(true)}>Configurar modo oscuro</button>
        </div>
      )}
    </div>

    {showQuickLinks && (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
        onClick={() => setShowQuickLinks(false)}
      >
        <div
          className="w-full max-w-2xl space-y-4 rounded bg-white p-4 text-gray-800 shadow-lg dark:bg-gray-900 dark:text-gray-100"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">Links rápidos</h2>
              <p className="text-sm text-gray-500 dark:text-gray-300">Presiona H o Escape para cerrar.</p>
            </div>
            <button className="text-sm underline" onClick={() => setShowQuickLinks(false)}>Cerrar</button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {quickLinkSlots.map((link, index) => (
              <button
                key={link.id}
                type="button"
                onClick={() => openQuickLink(link)}
                disabled={!link.url}
                className={`rounded border px-3 py-3 text-left transition ${
                  link.url
                    ? 'border-gray-300 hover:border-indigo-500 hover:shadow dark:border-gray-600 dark:hover:border-indigo-300'
                    : 'border-dashed border-gray-300 text-gray-400 dark:border-gray-700'
                }`}
              >
                <div className="flex items-baseline justify-between text-xs text-gray-500 dark:text-gray-400">
                  <span>#{index + 1}</span>
                  {link.url && <span>↗</span>}
                </div>
                <div className="mt-1 truncate font-semibold">
                  {link.label || 'Espacio libre'}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                  {link.url || 'Configura este enlace en tu archivo config.json'}
                </div>
              </button>
            ))}
          </div>
          {!quickLinks.length && (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Puedes declarar hasta 6 enlaces en <code>quickLinks</code> dentro de tu config.json.
            </p>
          )}
        </div>
      </div>
    )}

    {showMoodleTargetPicker && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
        <div className="w-full max-w-md space-y-4 rounded bg-white p-4 text-gray-800 shadow dark:bg-gray-800 dark:text-gray-100">
          <div>
            <h2 className="text-lg font-semibold">Seleccionar destino</h2>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Elige si deseas guardar esta descarga en teoría o práctica.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {moodleTargetOptions.map((option) => (
              <button
                key={option.path}
                onClick={() => handleChooseMoodleTarget(option)}
                className="rounded border border-gray-300 px-3 py-2 text-left text-sm shadow-sm transition hover:border-indigo-500 hover:shadow dark:border-gray-600 dark:hover:border-indigo-400"
              >
                <div className="text-base font-semibold">
                  {option.type === 'theory' ? 'Teoría' : 'Práctica'}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-300">
                  {formatBreadcrumb(option.path || null)}
                </div>
              </button>
            ))}
          </div>
          <div className="flex justify-end">
            <button className="text-sm underline" onClick={handleDismissMoodleTargetPicker}>
              Cancelar
            </button>
          </div>
        </div>
      </div>
    )}

    {showMoodleModal && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div className="bg-white dark:bg-gray-800 w-full max-w-lg mx-4 p-4 rounded shadow space-y-4 text-gray-800 dark:text-gray-200">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Sincronizar Moodle</h2>
            <button onClick={() => setShowMoodleModal(false)} className="text-sm underline">Cerrar</button>
          </div>
          <div className="text-sm text-gray-600 dark:text-gray-400">
            Carpeta destino actual: {formatBreadcrumb(activeMoodlePath || null)}
          </div>
          <label className="flex flex-col gap-1 text-sm">
            Token Moodle
            <input
              type="password"
              value={moodleToken}
              onChange={(e) => setMoodleToken(e.target.value)}
              className="border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-transparent"
              placeholder="Token"
            />
          </label>
          {moodleError && <div className="text-sm text-red-500">{moodleError}</div>}
          <p className="text-xs text-gray-500 dark:text-gray-400">Los archivos de video descargados apareceran marcados como "Video" en la lista lateral.</p>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">IDs guardados</span>
              <button
                className="text-sm underline"
                onClick={() => setShowAddFolderForm((prev) => !prev)}
              >
                {showAddFolderForm ? 'Cancelar' : 'Agregar carpeta'}
              </button>
            </div>
            {showAddFolderForm && (
              <form
                onSubmit={handleAddMoodleFolder}
                className="space-y-2 border border-dashed border-gray-300 dark:border-gray-600 rounded p-3"
              >
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <label className="flex flex-col gap-1">
                    Curso ID
                    <input
                      value={newCourseId}
                      onChange={(e) => setNewCourseId(e.target.value)}
                      className="border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-transparent"
                      placeholder="Ej: 12345"
                      inputMode="numeric"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    Folder ID
                    <input
                      value={newFolderId}
                      onChange={(e) => setNewFolderId(e.target.value)}
                      className="border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-transparent"
                      placeholder="Ej: 67890"
                      inputMode="numeric"
                    />
                  </label>
                </div>
                <label className="flex flex-col gap-1 text-sm">
                  Nombre opcional
                  <input
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    className="border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-transparent"
                    placeholder="Ej: Algebra Semana 1"
                  />
                </label>
                <button
                  type="submit"
                  className="w-full text-sm border border-gray-300 dark:border-gray-600 rounded px-3 py-1"
                  disabled={!!syncingFolderId}
                >
                  Descargar y guardar
                </button>
              </form>
            )}
            {moodleFolders.length ? (
              <ul className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {moodleFolders.map((config) => (
                  <li
                    key={config.id}
                    className="border border-gray-200 dark:border-gray-700 rounded p-2 text-sm space-y-1"
                  >
                    <div className="font-medium">{config.name || `Curso ${config.courseId}`}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">Curso: {config.courseId} - Folder: {config.folderId}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">Destino: {formatBreadcrumb(config.path || null)}</div>
                    {config.lastSynced && (
                      <div className="text-xs text-gray-500 dark:text-gray-400">Ultima descarga: {new Date(config.lastSynced).toLocaleString()}</div>
                    )}
                    <div className="flex gap-2 pt-1">
                      <button
                        className="border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-xs"
                        onClick={() => handleSyncExisting(config)}
                        disabled={syncingFolderId === config.id}
                      >
                        {syncingFolderId === config.id ? 'Descargando...' : 'Descargar'}
                      </button>
                      <button
                        className="border border-red-400 text-red-500 rounded px-2 py-1 text-xs"
                        onClick={() => handleRemoveMoodleFolder(config.id)}
                      >
                        Eliminar
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400">Aun no hay IDs guardados.</p>
            )}
          </div>
        </div>
      </div>
    )}

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




