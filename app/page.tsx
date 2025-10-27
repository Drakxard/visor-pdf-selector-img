"use client"

import {
  DragEvent,
  FormEvent,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react"
import { useTheme } from "next-themes"
import { usePathname, useRouter } from "next/navigation"

import {
  DEFAULT_GROQ_IMAGE_PROMPT,
  DEFAULT_GROQ_MODEL,
  DEFAULT_GROQ_PROMPT,
} from "@/lib/groq"

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

const isVideosSegment = (segment: string) =>
  normalizeSegment(segment) === "videos"

const isWeekSegment = (segment: string) => {
  const normalized = normalizeSegment(segment)
  return /^semana\s*\d*$/.test(normalized)
}

const pathContainsWeekSegment = (path: string) =>
  path
    .split("/")
    .filter(Boolean)
    .some((segment) => isWeekSegment(segment))

const encodePathForQuickLink = (path: string) => {
  const segments = path.split("/").filter(Boolean)
  if (!segments.length) return ""
  return `/${segments.map((segment) => encodeURIComponent(segment)).join('/')}`
}

const formatQuickLinkLabelFromPath = (path: string) =>
  path
    .split("/")
    .filter(Boolean)
    .join(" / ")

const formatQuickLinkUrlForDisplay = (url: string) => {
  try {
    return decodeURI(url)
  } catch {
    return url
  }
}

const ensureLeadingSlash = (value: string | null | undefined) => {
  if (!value) return '/'
  const trimmed = value.trim()
  if (!trimmed) return '/'
  if (trimmed === '/') return '/'
  const withoutLeading = trimmed.replace(/^\/+/, '')
  return `/${withoutLeading}`
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

const normalizePathSegments = (value: string) =>
  value
    .split("/")
    .filter(Boolean)
    .map((segment) => normalizeSegment(segment))
    .join("/")

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

const determineDefaultTableType = (containerPath: string): 'theory' | 'practice' => {
  const dirSegments = containerPath.split('/').filter(Boolean)
  for (let i = dirSegments.length - 1; i >= 0; i--) {
    if (isPracticeSegment(dirSegments[i])) {
      return 'practice'
    }
    if (isTheorySegment(dirSegments[i])) {
      return 'theory'
    }
  }
  return 'theory'
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
  path?: string
}

type PropositionEntry = {
  id: number
  title: string
  read?: boolean
  url?: string
}

type NotebookEntry = {
  id: string
  name: string
  url?: string
  content?: string
  type: 'link' | 'note'
}

const sortPropositions = (entries: PropositionEntry[]) => {
  const unread: PropositionEntry[] = []
  const read: PropositionEntry[] = []
  entries.forEach((entry) => {
    if (entry.read) {
      read.push(entry)
    } else {
      unread.push(entry)
    }
  })
  return [...unread, ...read]
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

type WeekOption = {
  path: string
  label: string
}

const generateNotebookId = () =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `notebook-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

const GROQ_CONFIG_STORAGE_KEY = 'groq-vision-config'
const GROQ_MODEL_LIST_STORAGE_KEY = 'groq-vision-models'
const DEFAULT_DARK_MODE_START = 23
const PROPOSITION_STORAGE_KEY = 'propositionsByPath'
const PROPOSITION_LAST_ID_STORAGE_KEY = 'propositionLastId'
const PROPOSITION_BASE_URL_STORAGE_KEY = 'propositionBaseUrl'
const TABLE_TYPE_OVERRIDE_STORAGE_KEY = 'tableTypeOverrides'
const FILE_ORDER_STORAGE_KEY = 'fileOrderOverrides'
const NOTEBOOK_STORAGE_KEY = 'notebooksByPath'

const normalizeQuickLinks = (raw: unknown, prefix = 'link'): QuickLink[] => {
  if (!Array.isArray(raw)) return []
  const seenUrls = new Set<string>()
  const seenPaths = new Set<string>()
  const result: QuickLink[] = []
  const tryAddLink = (link: QuickLink) => {
    const normalizedUrl = (link.url || '').toLowerCase()
    const normalizedPath = link.path ? normalizePathSegments(link.path) : ''
    if (normalizedPath) {
      if (seenPaths.has(normalizedPath)) return
      seenPaths.add(normalizedPath)
    }
    if (normalizedUrl) {
      if (seenUrls.has(normalizedUrl)) return
      seenUrls.add(normalizedUrl)
    }
    result.push(link)
  }
  raw.forEach((item, index) => {
    if (typeof item === 'string') {
      const url = item.trim()
      if (!url) return
      tryAddLink({ id: `${prefix}-${index}`, label: url, url })
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
    const rawPathValue =
      typeof obj['path'] === 'string'
        ? (obj['path'] as string)
            .split('/')
            .filter(Boolean)
            .join('/')
        : ''
    if (!rawUrlValue && !rawPathValue) return
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
    const linkUrl = rawUrlValue || (rawPathValue ? encodePathForQuickLink(rawPathValue) : '')
    const link: QuickLink = {
      id: idValue,
      label:
        labelValue ||
        (rawPathValue ? formatQuickLinkLabelFromPath(rawPathValue) : rawUrlValue || linkUrl),
      url: linkUrl,
    }
    if (rawPathValue) {
      link.path = rawPathValue
    }
    tryAddLink(link)
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
  const [setupComplete, setSetupComplete] = useState(true)
  const [step, setStep] = useState(0)
  const [names, setNames] = useState<string[]>([])
  const [theory, setTheory] = useState<Record<string, string>>({})
  const [practice, setPractice] = useState<Record<string, string>>({})
  const [tableTypeOverrides, setTableTypeOverrides] = useState<
    Record<string, 'theory' | 'practice'>
  >({})
  const [fileOrderOverrides, setFileOrderOverrides] = useState<
    Record<string, string[]>
  >({})
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
  const [showGroqModal, setShowGroqModal] = useState(false)
  const [showPropositionModal, setShowPropositionModal] = useState(false)
  const [groqModel, setGroqModel] = useState(DEFAULT_GROQ_MODEL)
  const [groqModels, setGroqModels] = useState<string[]>([])
  const [groqPrompt, setGroqPrompt] = useState(DEFAULT_GROQ_PROMPT)
  const [groqImagePrompt, setGroqImagePrompt] = useState(DEFAULT_GROQ_IMAGE_PROMPT)
  const [groqModelsError, setGroqModelsError] = useState<string | null>(null)
  const [groqModelError, setGroqModelError] = useState<string | null>(null)
  const [groqLoadingModels, setGroqLoadingModels] = useState(false)
  const [groqSaving, setGroqSaving] = useState(false)
  const [darkModeStart, setDarkModeStart] = useState(DEFAULT_DARK_MODE_START)
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
  const initialWeekAppliedRef = useRef(false)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const toastTimerRef = useRef<number | null>(null)
  const [propositionsByPath, setPropositionsByPath] = useState<Record<string, PropositionEntry[]>>({})
  const [lastPropositionId, setLastPropositionId] = useState(0)
  const [propositionBaseUrl, setPropositionBaseUrl] = useState('')
  const [propositionBaseUrlDraft, setPropositionBaseUrlDraft] = useState('')
  const [propositionsHydrated, setPropositionsHydrated] = useState(false)
  const [showPropositionInput, setShowPropositionInput] = useState(false)
  const [newPropositionTitle, setNewPropositionTitle] = useState('')
  const [creatingProposition, setCreatingProposition] = useState(false)
  const [editingPropositionId, setEditingPropositionId] = useState<number | null>(null)
  const [editingPropositionTitle, setEditingPropositionTitle] = useState('')
  const propositionInputRef = useRef<HTMLInputElement>(null)
  const editingPropositionInputRef = useRef<HTMLInputElement>(null)
  const [showManualPropositionModal, setShowManualPropositionModal] = useState(false)
  const [manualPropositionTitle, setManualPropositionTitle] = useState('')
  const [manualPropositionUrl, setManualPropositionUrl] = useState('')
  const manualPropositionTitleRef = useRef<HTMLInputElement>(null)
  const [notebooksByPath, setNotebooksByPath] = useState<Record<string, NotebookEntry[]>>({})
  const [notebooksHydrated, setNotebooksHydrated] = useState(false)
  const [showNotebookInput, setShowNotebookInput] = useState(false)
  const [newNotebookName, setNewNotebookName] = useState('')
  const [editingNotebookId, setEditingNotebookId] = useState<string | null>(null)
  const [editingNotebookName, setEditingNotebookName] = useState('')
  const notebookInputRef = useRef<HTMLInputElement>(null)
  const editingNotebookInputRef = useRef<HTMLInputElement>(null)
  const [creatingNotebook, setCreatingNotebook] = useState(false)
  const [showSaveViewerNoteModal, setShowSaveViewerNoteModal] = useState(false)
  const [viewerNoteDraftName, setViewerNoteDraftName] = useState('')
  const [pendingViewerNote, setPendingViewerNote] = useState<{ html: string; text: string } | null>(null)
  const saveViewerNoteInputRef = useRef<HTMLInputElement>(null)
  const [draggedFile, setDraggedFile] = useState<PdfFile | null>(null)
  const [draggedSourceType, setDraggedSourceType] = useState<'theory' | 'practice' | null>(null)
  const [draggedSourcePath, setDraggedSourcePath] = useState('')
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
  const [windowsBasePath, setWindowsBasePath] = useState('')
  const [windowsBasePathDraft, setWindowsBasePathDraft] = useState('')
  const hasPropositions = useMemo(
    () => Object.values(propositionsByPath).some((entries) => entries.length > 0),
    [propositionsByPath],
  )
  const showToastMessage = useCallback((type: 'success' | 'error', text: string) => {
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current)
    setToast({ type, text })
    toastTimerRef.current = window.setTimeout(() => setToast(null), 3000)
  }, [])
  const rootFolderName = useMemo(() => {
    if (rootHandle?.name) return rootHandle.name
    for (const file of dirFiles) {
      const rel = ((file as any).webkitRelativePath as string | undefined) || ''
      if (!rel) continue
      const first = rel.split('/')[0]
      if (first) return first
    }
    return ''
  }, [dirFiles, rootHandle])
  const activeDirectoryPath = useMemo(
    () => viewWeek ?? currentPdf?.containerPath ?? '',
    [currentPdf, viewWeek],
  )
  const computedWindowsPath = useMemo(() => {
    const segments = activeDirectoryPath.split('/').filter(Boolean)
    const sanitizedBase = windowsBasePath.trim().replace(/\//g, '\\')
    const trimmedBase = sanitizedBase.replace(/\\+$/, '')
    const appendSegment = (base: string, segment: string) =>
      base ? `${base}\\${segment}` : segment
    const rootName = rootFolderName.trim()
    let result = trimmedBase
    if (rootName) {
      const baseLower = trimmedBase.toLowerCase()
      const rootLower = rootName.toLowerCase()
      const hasRoot =
        baseLower === rootLower || baseLower.endsWith(`\\${rootLower}`)
      if (!trimmedBase) {
        result = rootName
      } else if (!hasRoot) {
        result = appendSegment(trimmedBase, rootName)
      }
    }
    if (!trimmedBase && !rootName) {
      result = ''
    }
    for (const segment of segments) {
      const normalized = segment.replace(/[\\/]+/g, '\\')
      result = appendSegment(result, normalized)
    }
    return result
  }, [activeDirectoryPath, rootFolderName, windowsBasePath])
  const handleCopyCurrentPath = useCallback(async () => {
    const targetPath = computedWindowsPath
    if (!targetPath) {
      showToastMessage('error', 'Configura la ruta base en ajustes para copiarla.')
      return
    }
    if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
      showToastMessage('error', 'El portapapeles no está disponible en este navegador.')
      return
    }
    try {
      await navigator.clipboard.writeText(targetPath)
      showToastMessage('success', 'Ruta copiada al portapapeles')
    } catch (error) {
      console.error('Failed to copy path', error)
      showToastMessage('error', 'No se pudo copiar la ruta al portapapeles.')
    }
  }, [computedWindowsPath, showToastMessage])

  const handleAddDirectoryQuickLink = useCallback(
    (path: string) => {
      const trimmedPath = path.split('/').filter(Boolean).join('/')
      if (!trimmedPath) {
        showToastMessage('error', 'No se pudo generar el enlace para esta carpeta.')
        return
      }
      const normalizedPathKey = normalizePathSegments(trimmedPath)
      const url = encodePathForQuickLink(trimmedPath)
      if (!url) {
        showToastMessage('error', 'No se pudo generar el enlace para esta carpeta.')
        return
      }
      const normalizedUrl = url.toLowerCase()
      const alreadyLinkedByUrl = quickLinks.some(
        (link) => (link.url || '').toLowerCase() === normalizedUrl,
      )
      const alreadyLinkedByPath = normalizedPathKey
        ? quickLinks.some((link) =>
            link.path ? normalizePathSegments(link.path) === normalizedPathKey : false,
          )
        : false
      if (alreadyLinkedByUrl || alreadyLinkedByPath) {
        showToastMessage('error', 'Esta carpeta ya está en tus links rápidos.')
        return
      }
      if (quickLinks.length >= QUICK_LINK_SLOT_COUNT) {
        showToastMessage('error', 'No hay espacios disponibles en los links rápidos.')
        return
      }
      const label = formatQuickLinkLabelFromPath(trimmedPath) || trimmedPath
      const idBase = trimmedPath
        .split('/')
        .map((segment) => normalizeSegment(segment).replace(/[^a-z0-9]+/g, '-'))
        .join('-')
        .replace(/^-+|-+$/g, '')
      const newLink: QuickLink = {
        id: `dir-${idBase || 'link'}-${Date.now()}`,
        label,
        url,
        path: trimmedPath,
      }
      setQuickLinks([...quickLinks, newLink])
      showToastMessage('success', 'Enlace agregado a links rápidos')
    },
    [quickLinks, showToastMessage],
  )
  const handleSaveWindowsBasePath = useCallback(() => {
    const sanitized = windowsBasePathDraft.trim().replace(/\//g, '\\')
    setWindowsBasePath(sanitized)
    setWindowsBasePathDraft(sanitized)
    setStoredItem('windowsBasePath', sanitized || null)
    showToastMessage(
      'success',
      sanitized ? 'Ruta base guardada' : 'Ruta base eliminada',
    )
  }, [showToastMessage, windowsBasePathDraft])
  const handleSavePropositionSettings = useCallback(() => {
    const trimmed = propositionBaseUrlDraft.trim()
    setPropositionBaseUrl(trimmed)
    showToastMessage('success', 'Configuración de proposiciones guardada')
    setShowPropositionModal(false)
  }, [propositionBaseUrlDraft, showToastMessage])
  const handleResetPropositionIds = useCallback(() => {
    if (!hasPropositions) return
    if (!window.confirm('Esto reiniciará los IDs de las proposiciones. ¿Deseas continuar?')) {
      return
    }
    let newLastId = 0
    setPropositionsByPath((prev) => {
      const uniqueEntries = new Map<number, PropositionEntry>()
      const ordered: PropositionEntry[] = []
      Object.values(prev).forEach((entries) => {
        entries.forEach((entry) => {
          if (!uniqueEntries.has(entry.id)) {
            uniqueEntries.set(entry.id, entry)
            ordered.push(entry)
          }
        })
      })
      if (!ordered.length) {
        newLastId = 0
        return prev
      }
      const sortedUnique = [...ordered].sort((a, b) => a.id - b.id)
      const idMapping = new Map<number, number>()
      sortedUnique.forEach((entry, index) => {
        idMapping.set(entry.id, index + 1)
      })
      newLastId = sortedUnique.length
      let changed = false
      const next: Record<string, PropositionEntry[]> = {}
      Object.entries(prev).forEach(([path, entries]) => {
        const nextEntries = entries.map((entry) => {
          const mappedId = idMapping.get(entry.id)
          if (!mappedId || mappedId === entry.id) {
            return entry
          }
          changed = true
          return { ...entry, id: mappedId }
        })
        next[path] = sortPropositions(nextEntries)
      })
      return changed ? next : prev
    })
    setLastPropositionId(newLastId)
    showToastMessage('success', 'IDs de proposiciones reiniciados')
  }, [hasPropositions, setPropositionsByPath, setLastPropositionId, showToastMessage])
  const fetchGroqModels = useCallback(
    async (forceRefresh = false) => {
      setGroqLoadingModels(true)
      setGroqModelsError(null)
      try {
        const response = await fetch('/api/groq/models', { cache: 'no-store' })
        if (!response.ok) {
          let message = 'No se pudieron obtener los modelos disponibles.'
          try {
            const data = await response.json()
            if (data?.error && typeof data.error === 'string') {
              message = data.error
            }
          } catch {}
          setGroqModelsError(message)
          return
        }
        const data = await response.json()
        const nextModels: string[] = Array.isArray(data?.models)
          ? data.models
              .map((item: unknown) => (typeof item === 'string' ? item.trim() : null))
              .filter((item: string | null): item is string => !!item)
          : []
        setGroqModels(nextModels)
        setStoredItem(
          GROQ_MODEL_LIST_STORAGE_KEY,
          JSON.stringify({ models: nextModels, fetchedAt: Date.now() }),
        )
        if (!nextModels.includes(groqModel)) {
          const fallbackModel = nextModels.includes(DEFAULT_GROQ_MODEL)
            ? DEFAULT_GROQ_MODEL
            : nextModels[0] ?? DEFAULT_GROQ_MODEL
          setGroqModel(fallbackModel)
        }
        if (forceRefresh) {
          showToastMessage('success', 'Modelos sincronizados correctamente')
        }
      } catch (error) {
        console.error('Error loading Groq models', error)
        setGroqModelsError('No se pudieron obtener los modelos disponibles.')
      } finally {
        setGroqLoadingModels(false)
      }
    },
    [groqModel, showToastMessage],
  )
  const handleSaveGroqConfig = useCallback(() => {
    if (!groqModel) {
      setGroqModelError('Selecciona un modelo disponible.')
      return
    }
    const trimmedPrompt = groqPrompt.trim() || DEFAULT_GROQ_PROMPT
    const trimmedImagePrompt =
      groqImagePrompt.trim() || DEFAULT_GROQ_IMAGE_PROMPT
    setGroqSaving(true)
    try {
      setStoredItem(
        GROQ_CONFIG_STORAGE_KEY,
        JSON.stringify({
          model: groqModel,
          prompt: trimmedPrompt,
          imagePrompt: trimmedImagePrompt,
        }),
      )
      setGroqPrompt(trimmedPrompt)
      setGroqImagePrompt(trimmedImagePrompt)
      setGroqModelError(null)
      showToastMessage('success', 'Configuración guardada')
      setShowGroqModal(false)
    } finally {
      setGroqSaving(false)
    }
  }, [groqModel, groqPrompt, showToastMessage])
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
  const [syncedPath, setSyncedPath] = useState(pathname ?? '/')
  const skipNextPathSyncRef = useRef(false)
  const router = useRouter()

  useEffect(() => {
    if (skipNextPathSyncRef.current) {
      skipNextPathSyncRef.current = false
      return
    }
    setSyncedPath(pathname ?? '/')
  }, [pathname])

  const routeScope = useMemo(() => {
    const rawPath = syncedPath ?? ''
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
  }, [syncedPath])

  const normalizedDirectoryLookup = useMemo(() => {
    const map = new Map<string, string>()
    Object.keys(directoryTree).forEach((path) => {
      if (!path) return
      const normalized = normalizePathSegments(path)
      if (normalized && !map.has(normalized)) {
        map.set(normalized, path)
      }
    })
    return map
  }, [directoryTree])

  const weekSelectId = useId()
  const routeScopeKey =
    routeScope.scope === 'subject'
      ? `${routeScope.tableType}::${routeScope.normalizedSubject}`
      : 'global'

  const updateUrlWithoutNavigation = useCallback((path: string | null) => {
    if (typeof window === 'undefined') return
    const targetPath = ensureLeadingSlash(path)
    try {
      window.history.replaceState(null, '', targetPath)
    } catch (error) {
      console.warn('No se pudo actualizar la URL sin navegar', error)
    }
  }, [])

  const applyInternalPathChange = useCallback(
    (path: string | null) => {
      const targetPath = ensureLeadingSlash(path)
      skipNextPathSyncRef.current = true
      setSyncedPath(targetPath)
      updateUrlWithoutNavigation(targetPath)
    },
    [setSyncedPath, updateUrlWithoutNavigation],
  )

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

  const subjectWeekOptions = useMemo<WeekOption[]>(() => {
    if (routeScope.scope !== 'subject') return []
    const normalizedSubject = routeScope.normalizedSubject
    const unique = new Map<string, WeekOption>()
    for (const path of Object.keys(directoryTree)) {
      if (!path) continue
      const subjectPath = extractSubjectPath(path)
      if (!subjectPath) continue
      const subjectName = extractSubjectName(subjectPath)
      if (!subjectName) continue
      if (normalizeSegment(subjectName) !== normalizedSubject) continue
      const normalizedPathKey = normalizePathSegments(subjectPath)
      if (unique.has(normalizedPathKey)) continue
      const labelSegments = subjectPath.split('/').filter(Boolean)
      const label = labelSegments.length
        ? labelSegments.join(' / ')
        : subjectName
      unique.set(normalizedPathKey, { path: subjectPath, label })
    }
    return Array.from(unique.values()).sort((a, b) =>
      a.path.localeCompare(b.path, undefined, { numeric: true, sensitivity: 'base' }),
    )
  }, [directoryTree, routeScope])

  const weekOptionsKey = useMemo(
    () => subjectWeekOptions.map((option) => normalizePathSegments(option.path)).join('|'),
    [subjectWeekOptions],
  )

  const selectedWeekValue = useMemo(() => {
    if (routeScope.scope !== 'subject') return ''
    if (!viewWeek) return ''
    const normalizedView = normalizePathSegments(viewWeek)
    const matchedOption = subjectWeekOptions.find(
      (option) => normalizePathSegments(option.path) === normalizedView,
    )
    return matchedOption ? matchedOption.path : ''
  }, [routeScope, subjectWeekOptions, viewWeek])

  useEffect(() => {
    if (routeScope.scope === 'subject') return
    const rawPath = syncedPath ?? ''
    const segments = rawPath.split('/').filter(Boolean)
    if (!segments.length) return
    const decodedSegments = segments.map((segment) => {
      try {
        return decodeURIComponent(segment)
      } catch {
        return segment
      }
    })
    const normalizedTarget = normalizePathSegments(decodedSegments.join('/'))
    if (!normalizedTarget) return
    const match = normalizedDirectoryLookup.get(normalizedTarget)
    if (match) {
      if (match !== viewWeek) {
        setViewWeek(match)
      }
      return
    }
    if (viewWeek !== null) {
      setViewWeek(null)
    }
  }, [normalizedDirectoryLookup, routeScope, setViewWeek, syncedPath, viewWeek])

  useEffect(() => {
    let storedModel = ''
    const storedConfigRaw = getStoredItem(GROQ_CONFIG_STORAGE_KEY)
    if (storedConfigRaw) {
      try {
        const parsed = JSON.parse(storedConfigRaw)
        if (parsed && typeof parsed === 'object') {
          storedModel = typeof parsed.model === 'string' ? parsed.model : ''
          const storedPrompt =
            typeof parsed.prompt === 'string' && parsed.prompt.trim()
              ? parsed.prompt
              : DEFAULT_GROQ_PROMPT
          const storedImagePrompt =
            typeof parsed.imagePrompt === 'string' && parsed.imagePrompt.trim()
              ? parsed.imagePrompt
              : DEFAULT_GROQ_IMAGE_PROMPT
          if (storedModel) {
            setGroqModel(storedModel)
          }
          setGroqPrompt(storedPrompt)
          setGroqImagePrompt(storedImagePrompt)
        }
      } catch (error) {
        console.warn('No se pudo leer la configuración de Groq guardada', error)
      }
    }
    const storedModelsRaw = getStoredItem(GROQ_MODEL_LIST_STORAGE_KEY)
    if (storedModelsRaw) {
      try {
        const parsed = JSON.parse(storedModelsRaw)
        if (parsed && typeof parsed === 'object' && Array.isArray(parsed.models)) {
          const cachedModels = parsed.models.filter(
            (item: unknown): item is string => typeof item === 'string' && !!item.trim(),
          )
          if (cachedModels.length) {
            setGroqModels(cachedModels)
            if (!storedModel) {
              const fallbackModel = cachedModels.includes(DEFAULT_GROQ_MODEL)
                ? DEFAULT_GROQ_MODEL
                : cachedModels[0] ?? DEFAULT_GROQ_MODEL
              setGroqModel(fallbackModel)
            }
          }
        }
      } catch (error) {
        console.warn('No se pudo leer la lista de modelos de Groq guardada', error)
      }
    }
  }, [])

  const scopedLastPathKey = useMemo(
    () => getScopedStorageKey('lastPath'),
    [getScopedStorageKey],
  )

  useEffect(() => {
    setRestored(false)
  }, [scopedLastPathKey])

  useEffect(() => {
    if (!showGroqModal) return
    if (groqModels.length || groqLoadingModels) return
    void fetchGroqModels(false)
  }, [fetchGroqModels, groqLoadingModels, groqModels.length, showGroqModal])

  useEffect(() => {
    if (groqModel) {
      setGroqModelError(null)
    }
  }, [groqModel])

  useEffect(() => {
    initialWeekAppliedRef.current = false
  }, [routeScopeKey, weekOptionsKey])

  useEffect(() => {
    if (initialWeekAppliedRef.current) return
    if (routeScope.scope !== 'subject') {
      initialWeekAppliedRef.current = true
      return
    }
    if (!subjectWeekOptions.length) return
    const storedWeek = getScopedStoredItem('lastWeek')
    const matchedOption = storedWeek
      ? subjectWeekOptions.find(
          (option) =>
            normalizePathSegments(option.path) === normalizePathSegments(storedWeek),
        )
      : null
    const fallbackWeek = subjectWeekOptions[0]?.path ?? null
    const targetWeek = matchedOption?.path ?? viewWeek ?? fallbackWeek
    if (targetWeek && targetWeek !== viewWeek) {
      setViewWeek(targetWeek)
    }
    initialWeekAppliedRef.current = true
  }, [
    getScopedStoredItem,
    routeScope,
    setViewWeek,
    subjectWeekOptions,
    viewWeek,
  ])

  useEffect(() => {
    if (routeScope.scope !== 'subject') return
    if (!viewWeek) return
    const normalizedView = normalizePathSegments(viewWeek)
    const matchedOption = subjectWeekOptions.find(
      (option) => normalizePathSegments(option.path) === normalizedView,
    )
    if (!matchedOption) return
    setScopedStoredItem('lastWeek', matchedOption.path)
  }, [routeScope, setScopedStoredItem, subjectWeekOptions, viewWeek])

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
  useEffect(() => {
    const storedBase = getStoredItem('windowsBasePath')
    if (storedBase) {
      const sanitized = storedBase.replace(/\//g, '\\')
      setWindowsBasePath(sanitized)
      setWindowsBasePathDraft(sanitized)
    }
  }, [])

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
    const storedStartRaw = getStoredItem('darkModeStart')
    const parsedStart = parseInt(
      storedStartRaw ?? DEFAULT_DARK_MODE_START.toString(),
    )
    const normalizedStart = Number.isNaN(parsedStart)
      ? DEFAULT_DARK_MODE_START
      : parsedStart
    setDarkModeStart(normalizedStart)
    applyTheme(normalizedStart)
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
    const storedPropositionsRaw = getStoredItem(PROPOSITION_STORAGE_KEY)
    if (storedPropositionsRaw) {
      try {
        const parsed = JSON.parse(storedPropositionsRaw) as Record<string, unknown>
        const normalized: Record<string, PropositionEntry[]> = {}
        Object.entries(parsed).forEach(([key, value]) => {
          if (!Array.isArray(value)) return
          const entries = value
            .map((item) => {
              if (!item || typeof item !== 'object') return null
              const record = item as Record<string, unknown>
              const id = Number(record['id'])
              const titleRaw = typeof record['title'] === 'string' ? record['title'].trim() : ''
              const readValue = record['read']
              const read =
                typeof readValue === 'boolean'
                  ? readValue
                  : typeof readValue === 'string'
                    ? readValue.toLowerCase() === 'true'
                    : false
              const urlValue = record['url']
              const urlRaw =
                typeof urlValue === 'string' ? urlValue.trim() : ''
              if (!Number.isInteger(id) || id < 0) return null
              if (!titleRaw) return null
              return urlRaw
                ? { id, title: titleRaw, read, url: urlRaw }
                : { id, title: titleRaw, read }
            })
            .filter((entry): entry is PropositionEntry => entry !== null)
          if (entries.length) {
            normalized[key] = sortPropositions(entries)
          }
        })
        setPropositionsByPath(normalized)
      } catch {}
    }
    const storedLastIdRaw = getStoredItem(PROPOSITION_LAST_ID_STORAGE_KEY)
    if (storedLastIdRaw !== null) {
      const parsedId = parseInt(storedLastIdRaw, 10)
      if (!Number.isNaN(parsedId) && parsedId >= 0) {
        setLastPropositionId(parsedId)
      }
    }
    const storedBaseUrl = getStoredItem(PROPOSITION_BASE_URL_STORAGE_KEY)
    if (storedBaseUrl !== null) {
      setPropositionBaseUrl(storedBaseUrl)
    }
    setPropositionsHydrated(true)
  }, [])

  useEffect(() => {
    if (!showPropositionModal) return
    setPropositionBaseUrlDraft(propositionBaseUrl)
  }, [propositionBaseUrl, showPropositionModal])

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
    const storedOverrides = getStoredItem(TABLE_TYPE_OVERRIDE_STORAGE_KEY)
    if (storedOverrides) {
      try {
        const parsed = JSON.parse(storedOverrides)
        if (parsed && typeof parsed === 'object') {
          const next: Record<string, 'theory' | 'practice'> = {}
          Object.entries(parsed as Record<string, unknown>).forEach(([path, value]) => {
            if (value === 'theory' || value === 'practice') {
              next[path] = value
            }
          })
          if (Object.keys(next).length) {
            setTableTypeOverrides(next)
          }
        }
      } catch (error) {
        console.warn('Failed to parse stored table type overrides', error)
      }
    }
    const storedOrders = getStoredItem(FILE_ORDER_STORAGE_KEY)
    if (storedOrders) {
      try {
        const parsed = JSON.parse(storedOrders)
        if (parsed && typeof parsed === 'object') {
          const next: Record<string, string[]> = {}
          Object.entries(parsed as Record<string, unknown>).forEach(([key, value]) => {
            if (!Array.isArray(value)) return
            const filtered = value.filter((item): item is string => typeof item === 'string')
            if (filtered.length) {
              next[key] = filtered
            }
          })
          if (Object.keys(next).length) {
            setFileOrderOverrides(next)
          }
        }
      } catch (error) {
        console.warn('Failed to parse stored file order overrides', error)
      }
    }
  }, [])

  useEffect(() => {
    const storedNotebooks = getStoredItem(NOTEBOOK_STORAGE_KEY)
    if (storedNotebooks) {
      try {
        const parsed = JSON.parse(storedNotebooks)
        if (parsed && typeof parsed === 'object') {
          const next: Record<string, NotebookEntry[]> = {}
          Object.entries(parsed as Record<string, unknown>).forEach(([path, value]) => {
            if (!Array.isArray(value)) return
            const entries: NotebookEntry[] = []
            value.forEach((item) => {
              if (!item || typeof item !== 'object') return
              const raw = item as Record<string, unknown>
              const nameValue =
                typeof raw.name === 'string' && raw.name.trim()
                  ? raw.name.trim()
                  : typeof raw.title === 'string' && raw.title.trim()
                    ? raw.title.trim()
                    : typeof raw.label === 'string' && raw.label.trim()
                      ? raw.label.trim()
                      : ''
              const idValue =
                typeof raw.id === 'string' && raw.id.trim()
                  ? raw.id.trim()
                  : generateNotebookId()
              const typeValue = raw.type === 'note' ? 'note' : 'link'
              if (!nameValue) return
              if (typeValue === 'note') {
                const contentValue =
                  typeof raw.content === 'string' && raw.content.trim()
                    ? raw.content.trim()
                    : typeof raw.html === 'string' && raw.html.trim()
                      ? raw.html.trim()
                      : ''
                if (!contentValue) return
                entries.push({
                  id: idValue,
                  name: nameValue,
                  content: contentValue,
                  type: 'note',
                })
                return
              }
              const urlValue =
                typeof raw.url === 'string' && raw.url.trim()
                  ? raw.url.trim()
                  : typeof raw.href === 'string' && raw.href.trim()
                    ? raw.href.trim()
                    : ''
              if (!urlValue) return
              entries.push({ id: idValue, name: nameValue, url: urlValue, type: 'link' })
            })
            if (entries.length) {
              next[path] = entries
            }
          })
          if (Object.keys(next).length) {
            setNotebooksByPath(next)
          }
        }
      } catch (error) {
        console.warn('Failed to parse stored notebooks', error)
      }
    }
    setNotebooksHydrated(true)
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
    setStoredItem(
      TABLE_TYPE_OVERRIDE_STORAGE_KEY,
      Object.keys(tableTypeOverrides).length
        ? JSON.stringify(tableTypeOverrides)
        : null,
    )
  }, [tableTypeOverrides])

  useEffect(() => {
    setStoredItem(
      FILE_ORDER_STORAGE_KEY,
      Object.keys(fileOrderOverrides).length
        ? JSON.stringify(fileOrderOverrides)
        : null,
    )
  }, [fileOrderOverrides])

  useEffect(() => {
    if (!propositionsHydrated) return
    setStoredItem(
      PROPOSITION_STORAGE_KEY,
      JSON.stringify(propositionsByPath),
    )
  }, [propositionsByPath, propositionsHydrated])

  useEffect(() => {
    if (!notebooksHydrated) return
    const cleaned = Object.fromEntries(
      Object.entries(notebooksByPath).filter(([, entries]) => entries.length > 0),
    )
    setStoredItem(
      NOTEBOOK_STORAGE_KEY,
      Object.keys(cleaned).length ? JSON.stringify(cleaned) : null,
    )
  }, [notebooksByPath, notebooksHydrated])

  useEffect(() => {
    if (!propositionsHydrated) return
    setStoredItem(
      PROPOSITION_LAST_ID_STORAGE_KEY,
      lastPropositionId.toString(),
    )
  }, [lastPropositionId, propositionsHydrated])

  useEffect(() => {
    if (!propositionsHydrated) return
    setStoredItem(
      PROPOSITION_BASE_URL_STORAGE_KEY,
      propositionBaseUrl ? propositionBaseUrl : null,
    )
  }, [propositionBaseUrl, propositionsHydrated])

  useEffect(() => {
    if (!showPropositionInput) return
    const timer = window.setTimeout(() => {
      propositionInputRef.current?.focus()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [showPropositionInput])

  useEffect(() => {
    if (editingPropositionId === null) return
    const timer = window.setTimeout(() => {
      editingPropositionInputRef.current?.focus()
      editingPropositionInputRef.current?.select?.()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [editingPropositionId])

  useEffect(() => {
    if (!showManualPropositionModal) return
    const timer = window.setTimeout(() => {
      manualPropositionTitleRef.current?.focus()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [showManualPropositionModal])

  useEffect(() => {
    setShowPropositionInput(false)
    setNewPropositionTitle('')
    setEditingPropositionId(null)
    setEditingPropositionTitle('')
    setCreatingProposition(false)
  }, [viewWeek])

  useEffect(() => {
    if (!showNotebookInput) return
    const timer = window.setTimeout(() => {
      notebookInputRef.current?.focus()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [showNotebookInput])

  useEffect(() => {
    if (!editingNotebookId) return
    const timer = window.setTimeout(() => {
      editingNotebookInputRef.current?.focus()
      editingNotebookInputRef.current?.select?.()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [editingNotebookId])

  useEffect(() => {
    if (!showSaveViewerNoteModal) return
    const timer = window.setTimeout(() => {
      saveViewerNoteInputRef.current?.focus()
      saveViewerNoteInputRef.current?.select?.()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [showSaveViewerNoteModal])

  useEffect(() => {
    setShowNotebookInput(false)
    setNewNotebookName('')
    setEditingNotebookId(null)
    setEditingNotebookName('')
    setCreatingNotebook(false)
  }, [viewWeek])

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
      const relativePath = parts.join("/")
      const overrideType = tableTypeOverrides[relativePath]
      const item: PdfFile = {
        file,
        path: relativePath,
        week: subjectPath || dirPath,
        subject: subjectName,
        tableType: overrideType ?? tableType,
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
  }, [dirFiles, dirPaths, tableTypeOverrides])

  useEffect(() => {
    const validPaths = new Set<string>()
    Object.values(directoryTree).forEach((entry) => {
      entry.files.forEach((file) => validPaths.add(file.path))
    })
    setTableTypeOverrides((prev) => {
      const nextEntries = Object.entries(prev).filter(([path]) => validPaths.has(path))
      if (nextEntries.length === Object.keys(prev).length) {
        return prev
      }
      return Object.fromEntries(nextEntries)
    })
    setFileOrderOverrides((prev) => {
      let changed = false
      const next: Record<string, string[]> = {}
      Object.entries(prev).forEach(([key, order]) => {
        if (!Array.isArray(order) || order.length === 0) {
          if (order && order.length) changed = true
          return
        }
        const filtered: string[] = []
        order.forEach((path) => {
          if (validPaths.has(path) && !filtered.includes(path)) {
            filtered.push(path)
          } else if (!validPaths.has(path)) {
            changed = true
          }
        })
        if (filtered.length) {
          if (filtered.length !== order.length) changed = true
          next[key] = filtered
        } else if (order.length) {
          changed = true
        }
      })
      if (!changed && Object.keys(next).length === Object.keys(prev).length) {
        let same = true
        for (const key of Object.keys(next)) {
          const prevOrder = prev[key] ?? []
          const nextOrder = next[key] ?? []
          if (prevOrder.length !== nextOrder.length) {
            same = false
            break
          }
          for (let i = 0; i < nextOrder.length; i++) {
            if (prevOrder[i] !== nextOrder[i]) {
              same = false
              break
            }
          }
          if (!same) break
        }
        if (same) return prev
      }
      return next
    })
  }, [directoryTree])

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
      if (e.data?.type === 'viewerSaveAuxNote') {
        const rawHtml = typeof e.data.html === 'string' ? e.data.html : ''
        const rawText = typeof e.data.text === 'string' ? e.data.text : ''
        const trimmedHtml = rawHtml.trim()
        const convertTextToHtml = (value: string) =>
          value
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/\r?\n/g, '<br>')

        const finalHtml = trimmedHtml || convertTextToHtml(rawText)

        const computePreviewText = (html: string, fallbackText: string) => {
          if (!html) {
            return fallbackText.replace(/\u00a0/g, ' ')
          }
          const tempDiv = document.createElement('div')
          tempDiv.innerHTML = html

          tempDiv.querySelectorAll('span.note-sep').forEach((span) => {
            span.replaceWith(document.createTextNode('\n'))
          })

          tempDiv.querySelectorAll<HTMLElement>('[data-latex]').forEach((element) => {
            const latex = element.getAttribute('data-latex')
            if (latex && latex.trim().length > 0) {
              element.replaceWith(document.createTextNode(latex))
            }
          })

          return (tempDiv.textContent || fallbackText || '').replace(/\u00a0/g, ' ')
        }

        const previewText = computePreviewText(finalHtml, rawText)
        const normalizedText = previewText.trim()
        const hasText = normalizedText.length > 0
        const strippedHtml = trimmedHtml
          ? trimmedHtml.replace(/<[^>]+>/g, '').replace(/&nbsp;/gi, ' ').trim()
          : ''
        if (!hasText && !strippedHtml) {
          showToastMessage('error', 'La nota temporal está vacía.')
          return
        }
        const defaultFromText = hasText
          ? normalizedText.split(/\r?\n/).find((line) => line.trim().length > 0)?.trim() || ''
          : ''
        const pdfName =
          typeof e.data.pdfName === 'string' && e.data.pdfName.trim()
            ? e.data.pdfName.trim()
            : ''
        const baseName = defaultFromText || (pdfName ? `Nota de ${pdfName}` : '')
        const truncatedName = (baseName || 'Nota temporal').slice(0, 80)
        setPendingViewerNote({ html: finalHtml, text: previewText })
        setViewerNoteDraftName(truncatedName)
        setShowSaveViewerNoteModal(true)
        return
      }
      if (e.data?.type === 'viewerCreateProposition') {
        const rawId = e.data.id
        const parsedId =
          typeof rawId === 'number'
            ? rawId
            : typeof rawId === 'string'
              ? Number(rawId)
              : NaN
        const title =
          typeof e.data.title === 'string' ? e.data.title.trim() : ''
        if (!title || !Number.isFinite(parsedId) || parsedId <= 0) {
          return
        }
        const pdfPath =
          typeof e.data.pdfPath === 'string' ? e.data.pdfPath : ''
        const containerPath = pdfPath
          ? pdfPath.split('/').slice(0, -1).join('/').trim()
          : ''
        const activePath = viewWeek ?? ''
        const targetPaths = new Set<string>()
        if (pdfPath) {
          targetPaths.add(containerPath)
        }
        if (activePath && activePath !== containerPath) {
          targetPaths.add(activePath)
        }
        if (targetPaths.size === 0) {
          targetPaths.add(activePath || '')
        }
        const entry: PropositionEntry = { id: parsedId, title, read: false }
        setPropositionsByPath((prev) => {
          let changed = false
          const next: Record<string, PropositionEntry[]> = { ...prev }
          targetPaths.forEach((pathKey) => {
            const key = pathKey
            const prevEntries = next[key] ?? []
            if (prevEntries.some((item) => item.id === entry.id)) {
              return
            }
            next[key] = sortPropositions([...prevEntries, entry])
            changed = true
          })
          return changed ? next : prev
        })
        setLastPropositionId((prev) => (prev >= parsedId ? prev : parsedId))
      }
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [
    currentPdf,
    pdfUrl,
    setScopedStoredItem,
    setPropositionsByPath,
    setLastPropositionId,
    showToastMessage,
    viewWeek,
  ])

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
      const pathCandidates = new Set<string>()
      if (link.path) {
        pathCandidates.add(link.path)
      }
      if (rawUrl.startsWith('/')) {
        try {
          const decoded = decodeURIComponent(rawUrl.slice(1))
          if (decoded) {
            pathCandidates.add(decoded)
          }
        } catch {}
      }
      for (const candidate of pathCandidates) {
        const normalized = normalizePathSegments(candidate)
        if (!normalized) continue
        const match = normalizedDirectoryLookup.get(normalized)
        if (!match) continue
        if (match !== viewWeek) {
          setViewWeek(match)
        }
        const encoded = encodePathForQuickLink(match)
        applyInternalPathChange(encoded)
        setShowQuickLinks(false)
        return
      }
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
    [applyInternalPathChange, normalizedDirectoryLookup, router, setViewWeek, viewWeek],
  )

  const navigateToDirectory = useCallback(
    (target: string | null) => {
      if (routeScope.scope !== 'global') {
        setViewWeek(target)
        return
      }
      if (target) {
        setViewWeek(target)
        const encoded = encodePathForQuickLink(target)
        applyInternalPathChange(encoded)
      } else {
        setViewWeek(null)
        applyInternalPathChange(null)
      }
    },
    [applyInternalPathChange, routeScope, setViewWeek],
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
  const activePropositionPath = viewWeek ?? ''
  const activePropositions = propositionsByPath[activePropositionPath] ?? []
  const hasActivePropositions = activePropositions.length > 0
  const unreadPropositions = activePropositions.filter((entry) => !entry.read).length
  const allPropositionsRead = hasActivePropositions && unreadPropositions === 0
  const anyPropositionRead = activePropositions.some((entry) => entry.read)
  const activeNotebookPath = activePropositionPath
  const activeNotebooks = notebooksByPath[activeNotebookPath] ?? []
  const hasActiveNotebooks = activeNotebooks.length > 0
  const propositionStatusIcon = allPropositionsRead
    ? '✔'
    : anyPropositionRead
      ? '⬛'
      : '⬜'
  const propositionToggleLabel = allPropositionsRead
    ? 'Marcar todas las proposiciones como no leídas'
    : 'Marcar todas las proposiciones como leídas'

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
  const videoChildPaths = childDirectories.filter((dir) =>
    isVideosSegment(getLastSegment(dir)),
  )

  const aggregatedChildSet = new Set([
    ...theoryChildPaths,
    ...practiceChildPaths,
    ...videoChildPaths,
  ])
  const otherChildDirectories = childDirectories.filter(
    (dir) => !aggregatedChildSet.has(dir),
  )

  const directTheoryFiles = selectedFiles.filter(
    (file) => file.tableType === 'theory',
  )
  const directPracticeFiles = selectedFiles.filter(
    (file) => file.tableType === 'practice',
  )

  const collectAndSort = (paths: string[], direct: PdfFile[], orderKey: string) => {
    const combined = [...direct, ...paths.flatMap((path) => collectFiles(path))]
    const orderList = fileOrderOverrides[orderKey] ?? []
    const orderMap = new Map<string, number>()
    orderList.forEach((path, index) => {
      if (!orderMap.has(path)) {
        orderMap.set(path, index)
      }
    })
    return combined.sort((a, b) => {
      const aIndex = orderMap.has(a.path)
        ? (orderMap.get(a.path) as number)
        : Number.POSITIVE_INFINITY
      const bIndex = orderMap.has(b.path)
        ? (orderMap.get(b.path) as number)
        : Number.POSITIVE_INFINITY
      if (aIndex !== bIndex) {
        return aIndex - bIndex
      }
      return a.file.name.localeCompare(b.file.name, undefined, {
        numeric: true,
        sensitivity: 'base',
      })
    })
  }

  const buildOrderKey = (path: string, type: 'theory' | 'practice') => `${path || ''}::${type}`
  const theoryOrderKey = buildOrderKey(currentDirEntry.path || '', 'theory')
  const practiceOrderKey = buildOrderKey(currentDirEntry.path || '', 'practice')
  const theoryFiles = collectAndSort(theoryChildPaths, directTheoryFiles, theoryOrderKey)
  const practiceFilesAll = collectAndSort(
    practiceChildPaths,
    directPracticeFiles,
    practiceOrderKey,
  )
  const practiceDocuments = practiceFilesAll.filter(
    (file) => file.mediaType !== "video",
  )
  const practiceVideosFromAll = practiceFilesAll.filter(
    (file) => file.mediaType === "video",
  )
  const nestedVideos = videoChildPaths
    .flatMap((path) => collectFiles(path))
    .filter((file) => file.mediaType === "video")
  const practiceVideoFiles = [...practiceVideosFromAll, ...nestedVideos]
    .reduce<PdfFile[]>((acc, file) => {
      if (!acc.some((existing) => existing.path === file.path)) {
        acc.push(file)
      }
      return acc
    }, [])
    .sort((a, b) =>
      a.file.name.localeCompare(b.file.name, undefined, {
        numeric: true,
        sensitivity: "base",
      }),
    )
  const hasPracticeContent =
    practiceDocuments.length > 0 || practiceVideoFiles.length > 0
  const currentDepth = (viewWeek?.split('/').filter(Boolean).length ?? 0)
  const showTheoryPractice =
    currentDepth >= 2 &&
    (
      theoryFiles.length > 0 ||
      hasPracticeContent ||
      aggregatedChildSet.size > 0 ||
      hasActivePropositions ||
      showPropositionInput ||
      hasActiveNotebooks ||
      showNotebookInput
    )

  const handleDragStart = (file: PdfFile, type: 'theory' | 'practice') =>
    (event: DragEvent<HTMLLIElement>) => {
      setDraggedFile(file)
      setDraggedSourceType(type)
      setDraggedSourcePath(currentDirEntry.path || '')
      try {
        event.dataTransfer.setData('text/plain', file.path)
      } catch {}
      event.dataTransfer.effectAllowed = 'move'
    }

  const handleDragEnd = () => {
    setDraggedFile(null)
    setDraggedSourceType(null)
    setDraggedSourcePath('')
  }

  const handleItemDragOver = (event: DragEvent<HTMLLIElement>) => {
    if (!draggedFile) return
    event.preventDefault()
    event.stopPropagation()
    event.dataTransfer.dropEffect = 'move'
  }

  const applyDropResult = (type: 'theory' | 'practice', orderedPaths: string[]) => {
    if (!draggedFile || !draggedSourceType) return
    if (draggedSourcePath !== (currentDirEntry.path || '')) {
      handleDragEnd()
      return
    }
    const uniqueOrderedPaths = orderedPaths.filter((path, index, arr) => {
      const firstIndex = arr.indexOf(path)
      return firstIndex === index
    })
    if (!uniqueOrderedPaths.includes(draggedFile.path)) {
      uniqueOrderedPaths.push(draggedFile.path)
    }
    const targetKey = buildOrderKey(currentDirEntry.path || '', type)
    const sourceKey = buildOrderKey(draggedSourcePath, draggedSourceType)
    setFileOrderOverrides((prev) => {
      const next: Record<string, string[]> = { ...prev }
      if (uniqueOrderedPaths.length) {
        next[targetKey] = uniqueOrderedPaths
      } else {
        delete next[targetKey]
      }
      if (sourceKey !== targetKey && prev[sourceKey]) {
        const filtered = prev[sourceKey].filter((path) => path !== draggedFile.path)
        if (filtered.length) {
          next[sourceKey] = filtered
        } else {
          delete next[sourceKey]
        }
      }
      return next
    })
    setTableTypeOverrides((prev) => {
      const defaultType = determineDefaultTableType(draggedFile.containerPath ?? '')
      if (type === defaultType) {
        if (!(draggedFile.path in prev)) return prev
        const { [draggedFile.path]: _removed, ...rest } = prev
        return rest
      }
      if (prev[draggedFile.path] === type) return prev
      return { ...prev, [draggedFile.path]: type }
    })
    handleDragEnd()
  }

  const handleDropOnItem = (targetFile: PdfFile, type: 'theory' | 'practice') =>
    (event: DragEvent<HTMLLIElement>) => {
      if (!draggedFile || !draggedSourceType) return
      if (draggedSourcePath !== (currentDirEntry.path || '')) {
        handleDragEnd()
        return
      }
      event.preventDefault()
      event.stopPropagation()
      const list = (type === 'theory' ? theoryFiles : practiceDocuments)
        .map((file) => file.path)
        .filter((path) => path !== draggedFile.path)
      let targetIndex = list.indexOf(targetFile.path)
      if (targetIndex < 0) {
        list.push(targetFile.path)
        targetIndex = list.length - 1
      }
      const rect = (event.currentTarget as HTMLLIElement).getBoundingClientRect()
      const offset = event.clientY - rect.top
      if (offset > rect.height / 2) {
        targetIndex += 1
      }
      list.splice(targetIndex, 0, draggedFile.path)
      applyDropResult(type, list)
    }

  const handleListDragOver = (event: DragEvent<HTMLUListElement>) => {
    if (!draggedFile) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }

  const handleListDrop = (type: 'theory' | 'practice') =>
    (event: DragEvent<HTMLUListElement>) => {
      if (!draggedFile || !draggedSourceType) return
      if (draggedSourcePath !== (currentDirEntry.path || '')) {
        handleDragEnd()
        return
      }
      event.preventDefault()
      const currentPaths = (
        type === 'theory' ? theoryFiles : practiceDocuments
      ).map(
        (file) => file.path,
      )
      if (!currentPaths.includes(draggedFile.path)) {
        currentPaths.push(draggedFile.path)
      }
      applyDropResult(type, currentPaths)
    }

  const renderCategorizedFileList = (
    files: PdfFile[],
    type: 'theory' | 'practice',
  ) => (
    <ul
      className="space-y-1"
      onDragOver={handleListDragOver}
      onDrop={handleListDrop(type)}
    >
      {files.map((p) => (
        <li
          key={p.path}
          className={`flex items-center gap-2 ${
            completed[p.path] ? 'line-through text-gray-400' : ''
          } ${draggedFile?.path === p.path ? 'opacity-60' : ''}`}
          draggable
          onDragStart={handleDragStart(p, type)}
          onDragEnd={handleDragEnd}
          onDragOver={handleItemDragOver}
          onDrop={handleDropOnItem(p, type)}
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
          <span className="text-xs text-gray-400">⋮⋮</span>
        </li>
      ))}
    </ul>
  )

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

  const renderVideoList = (files: PdfFile[]) => (
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
            <span className="ml-2 text-xs text-indigo-500 uppercase">Video</span>
          </span>
        </li>
      ))}
    </ul>
  )

  const handleVideoEnded = useCallback(() => {
    if (!currentPdf || currentPdf.mediaType !== 'video') return
    const containerPath = currentPdf.containerPath ?? ''
    const targetEntry =
      containerPath in directoryTree
        ? directoryTree[containerPath]
        : containerPath
          ? null
          : directoryTree['']
    let siblings: PdfFile[] = []
    if (targetEntry) {
      siblings = targetEntry.files.filter((file) => file.mediaType === 'video')
    } else {
      siblings = queue.filter(
        (file) => file.mediaType === 'video' && (file.containerPath ?? '') === containerPath,
      )
    }
    if (siblings.length <= 1) return
    const sorted = siblings
      .slice()
      .sort((a, b) =>
        a.file.name.localeCompare(b.file.name, undefined, {
          numeric: true,
          sensitivity: 'base',
        }),
      )
    const currentIndex = sorted.findIndex((file) => file.path === currentPdf.path)
    if (currentIndex < 0) return
    const nextVideo = sorted[currentIndex + 1]
    if (!nextVideo) return
    const nextQueueIndex = queue.findIndex((file) => file.path === nextVideo.path)
    if (nextQueueIndex >= 0) {
      setQueueIndex(nextQueueIndex)
      setCurrentPdf(queue[nextQueueIndex])
    } else {
      setCurrentPdf(nextVideo)
    }
  }, [currentPdf, directoryTree, queue])

  const handleCancelAddProposition = () => {
    setShowPropositionInput(false)
    setNewPropositionTitle('')
  }

  const handleOpenProposition = (entry: PropositionEntry) => {
    const manualUrl = entry.url?.trim()
    let targetUrl: string | null = null
    if (manualUrl) {
      targetUrl = manualUrl
    } else {
      const normalizedBase = propositionBaseUrl.trim().replace(/\/+$/, '')
      if (!normalizedBase) {
        showToastMessage('error', 'Configura la URL base de proposiciones en ajustes.')
        return
      }
      targetUrl = `${normalizedBase}/proposicion/${entry.id}`
    }
    window.open(targetUrl, '_blank', 'noopener,noreferrer')
    setPropositionsByPath((prev) => {
      const prevEntries = prev[activePropositionPath] ?? []
      if (!prevEntries.length) return prev
      const nextEntries = prevEntries.map((item) =>
        item.id === entry.id ? { ...item, read: true } : item,
      )
      return {
        ...prev,
        [activePropositionPath]: sortPropositions(nextEntries),
      }
    })
  }

  const handleRemoveProposition = (entry: PropositionEntry) => {
    if (editingPropositionId === entry.id) {
      setEditingPropositionId(null)
      setEditingPropositionTitle('')
    }
    setPropositionsByPath((prev) => {
      const prevEntries = prev[activePropositionPath] ?? []
      const nextEntries = prevEntries.filter((item) => item.id !== entry.id)
      if (nextEntries.length === prevEntries.length) {
        return prev
      }
      if (nextEntries.length === 0) {
        const { [activePropositionPath]: _removed, ...rest } = prev
        return rest
      }
      return {
        ...prev,
        [activePropositionPath]: sortPropositions(nextEntries),
      }
    })
  }

  const handleCreateProposition = async () => {
    if (creatingProposition) return
    const trimmedTitle = newPropositionTitle.trim()
    if (!trimmedTitle) {
      showToastMessage('error', 'Ingresa un nombre para la proposición.')
      return
    }
    if (
      typeof navigator === 'undefined' ||
      !navigator.clipboard ||
      typeof navigator.clipboard.readText !== 'function'
    ) {
      showToastMessage('error', 'No se puede acceder al portapapeles.')
      return
    }
    setCreatingProposition(true)
    try {
      const clipboardText = await navigator.clipboard.readText()
      const url = clipboardText.trim()
      if (!url) {
        showToastMessage('error', 'El portapapeles no contiene un enlace.')
        return
      }
      if (!/^https?:\/\//i.test(url)) {
        showToastMessage('error', 'El enlace debe comenzar con http:// o https://.')
        return
      }
      const nextId = lastPropositionId + 1
      setPropositionsByPath((prev) => {
        const prevEntries = prev[activePropositionPath] ?? []
        const nextEntries = sortPropositions([
          ...prevEntries,
          { id: nextId, title: trimmedTitle, read: false, url },
        ])
        return {
          ...prev,
          [activePropositionPath]: nextEntries,
        }
      })
      setLastPropositionId(nextId)
      setNewPropositionTitle('')
      setShowPropositionInput(false)
      showToastMessage('success', 'Proposición agregada')
    } catch (error) {
      console.error('Failed to read clipboard', error)
      showToastMessage('error', 'No se pudo leer el portapapeles.')
    } finally {
      setCreatingProposition(false)
    }
  }

  const handleCloseManualPropositionModal = () => {
    setShowManualPropositionModal(false)
    setManualPropositionTitle('')
    setManualPropositionUrl('')
  }

  const handleStartEditProposition = (entry: PropositionEntry) => {
    setShowPropositionInput(false)
    setNewPropositionTitle('')
    setEditingPropositionId(entry.id)
    setEditingPropositionTitle(entry.title)
  }

  const handleCancelEditProposition = () => {
    setEditingPropositionId(null)
    setEditingPropositionTitle('')
  }

  const handleConfirmEditProposition = (entryId: number) => {
    const trimmedTitle = editingPropositionTitle.trim()
    if (!trimmedTitle) {
      showToastMessage('error', 'Ingresa un nombre para la proposición.')
      return
    }
    let found = false
    let updated = false
    setPropositionsByPath((prev) => {
      const prevEntries = prev[activePropositionPath] ?? []
      if (!prevEntries.length) return prev
      const nextEntries = prevEntries.map((item) => {
        if (item.id !== entryId) return item
        found = true
        if (item.title === trimmedTitle) return item
        updated = true
        return { ...item, title: trimmedTitle }
      })
      if (!found || !updated) {
        return prev
      }
      return {
        ...prev,
        [activePropositionPath]: sortPropositions(nextEntries),
      }
    })
    if (updated) {
      showToastMessage('success', 'Nombre de la proposición actualizado')
    }
    handleCancelEditProposition()
  }

  const handleConfirmManualProposition = () => {
    const trimmedTitle = manualPropositionTitle.trim()
    const trimmedUrl = manualPropositionUrl.trim()
    if (!trimmedTitle) {
      showToastMessage('error', 'Ingresa un nombre para la proposición.')
      return
    }
    if (!trimmedUrl) {
      showToastMessage('error', 'Ingresa un enlace para la proposición.')
      return
    }
    if (!/^https?:\/\//i.test(trimmedUrl)) {
      showToastMessage('error', 'El enlace debe comenzar con http:// o https://.')
      return
    }
    const nextId = lastPropositionId + 1
    setPropositionsByPath((prev) => {
      const prevEntries = prev[activePropositionPath] ?? []
      const nextEntries = sortPropositions([
        ...prevEntries,
        { id: nextId, title: trimmedTitle, read: false, url: trimmedUrl },
      ])
      return {
        ...prev,
        [activePropositionPath]: nextEntries,
      }
    })
    setLastPropositionId(nextId)
    handleCloseManualPropositionModal()
  }

  const handleToggleAllPropositions = () => {
    if (!hasActivePropositions) return
    const markAsRead = !allPropositionsRead
    setPropositionsByPath((prev) => {
      const prevEntries = prev[activePropositionPath] ?? []
      if (!prevEntries.length) return prev
      const nextEntries = prevEntries.map((item) => ({
        ...item,
        read: markAsRead,
      }))
      return {
        ...prev,
        [activePropositionPath]: sortPropositions(nextEntries),
      }
    })
  }

  const handleCancelAddNotebook = () => {
    setShowNotebookInput(false)
    setNewNotebookName('')
  }

  const handleCreateNotebook = async () => {
    if (creatingNotebook) return
    const trimmedName = newNotebookName.trim()
    if (!trimmedName) {
      showToastMessage('error', 'Ingresa un nombre para el cuaderno.')
      return
    }
    if (
      typeof navigator === 'undefined' ||
      !navigator.clipboard ||
      typeof navigator.clipboard.readText !== 'function'
    ) {
      showToastMessage('error', 'No se puede acceder al portapapeles.')
      return
    }
    setCreatingNotebook(true)
    try {
      const clipboardText = await navigator.clipboard.readText()
      const url = clipboardText.trim()
      if (!url) {
        showToastMessage('error', 'El portapapeles no contiene un enlace.')
        return
      }
      if (!/^https?:\/\//i.test(url)) {
        showToastMessage('error', 'El enlace debe comenzar con http:// o https://.')
        return
      }
      const entry: NotebookEntry = {
        id: generateNotebookId(),
        name: trimmedName,
        url,
        type: 'link',
      }
      setNotebooksByPath((prev) => {
        const prevEntries = prev[activeNotebookPath] ?? []
        const nextEntries = [...prevEntries, entry]
        return {
          ...prev,
          [activeNotebookPath]: nextEntries,
        }
      })
      setShowNotebookInput(false)
      setNewNotebookName('')
      showToastMessage('success', 'Cuaderno agregado')
    } catch (error) {
      console.error('Failed to read clipboard', error)
      showToastMessage('error', 'No se pudo leer el portapapeles.')
    } finally {
      setCreatingNotebook(false)
    }
  }

  const handleStartEditNotebook = (entry: NotebookEntry) => {
    setShowNotebookInput(false)
    setNewNotebookName('')
    setEditingNotebookId(entry.id)
    setEditingNotebookName(entry.name)
  }

  const handleCancelEditNotebook = () => {
    setEditingNotebookId(null)
    setEditingNotebookName('')
  }

  const handleConfirmEditNotebook = (entryId: string) => {
    const trimmedName = editingNotebookName.trim()
    if (!trimmedName) {
      showToastMessage('error', 'Ingresa un nombre para el cuaderno.')
      return
    }
    let found = false
    let updated = false
    setNotebooksByPath((prev) => {
      const prevEntries = prev[activeNotebookPath] ?? []
      if (!prevEntries.length) return prev
      const nextEntries = prevEntries.map((item) => {
        if (item.id !== entryId) return item
        found = true
        if (item.name === trimmedName) return item
        updated = true
        return { ...item, name: trimmedName }
      })
      if (!found || !updated) {
        return prev
      }
      return {
        ...prev,
        [activeNotebookPath]: nextEntries,
      }
    })
    if (updated) {
      showToastMessage('success', 'Nombre del cuaderno actualizado')
    }
    handleCancelEditNotebook()
  }

  const handleRemoveNotebook = (entry: NotebookEntry) => {
    if (editingNotebookId === entry.id) {
      handleCancelEditNotebook()
    }
    setNotebooksByPath((prev) => {
      const prevEntries = prev[activeNotebookPath] ?? []
      const nextEntries = prevEntries.filter((item) => item.id !== entry.id)
      if (nextEntries.length === prevEntries.length) {
        return prev
      }
      if (nextEntries.length === 0) {
        const { [activeNotebookPath]: _removed, ...rest } = prev
        return rest
      }
      return {
        ...prev,
        [activeNotebookPath]: nextEntries,
      }
    })
  }

  const handleOpenNotebook = (entry: NotebookEntry) => {
    if (entry.type === 'note') {
      const content = entry.content?.trim()
      if (!content) {
        showToastMessage('error', 'Esta nota no tiene contenido para cargar.')
        return
      }
      const frameWindow = viewerRef.current?.contentWindow
      if (!frameWindow) {
        showToastMessage('error', 'Abre un PDF para cargar la nota temporal.')
        return
      }
      try {
        frameWindow.postMessage({ type: 'loadAuxNote', content }, '*')
        showToastMessage('success', 'Nota temporal cargada en el visor')
      } catch (error) {
        console.error('Failed to load notebook note', error)
        showToastMessage('error', 'No se pudo cargar la nota temporal en el visor.')
      }
      return
    }
    try {
      if (!entry.url) {
        showToastMessage('error', 'El cuaderno no tiene un enlace válido.')
        return
      }
      window.open(entry.url, '_blank', 'noopener,noreferrer')
    } catch (error) {
      console.error('Failed to open notebook link', error)
      showToastMessage('error', 'No se pudo abrir el cuaderno en una nueva pestaña.')
    }
  }

  const handleCancelSaveViewerNote = () => {
    setShowSaveViewerNoteModal(false)
    setViewerNoteDraftName('')
    setPendingViewerNote(null)
  }

  const handleConfirmSaveViewerNote = () => {
    if (!pendingViewerNote) {
      setShowSaveViewerNoteModal(false)
      return
    }
    const trimmedName = viewerNoteDraftName.trim()
    if (!trimmedName) {
      showToastMessage('error', 'Ingresa un nombre para la nota.')
      return
    }
    const content = pendingViewerNote.html.trim()
    if (!content) {
      showToastMessage('error', 'La nota temporal está vacía.')
      handleCancelSaveViewerNote()
      return
    }
    const entry: NotebookEntry = {
      id: generateNotebookId(),
      name: trimmedName,
      content,
      type: 'note',
    }
    setNotebooksByPath((prev) => {
      const prevEntries = prev[activeNotebookPath] ?? []
      const nextEntries = [...prevEntries, entry]
      return {
        ...prev,
        [activeNotebookPath]: nextEntries,
      }
    })
    showToastMessage('success', 'Nota guardada en cuadernos')
    setShowSaveViewerNoteModal(false)
    setViewerNoteDraftName('')
    setPendingViewerNote(null)
  }

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
              <button className="underline" onClick={() => navigateToDirectory(null)}>
                Inicio
              </button>
              {parentDirectory !== null && (
                <button
                  className="underline"
                  onClick={() => navigateToDirectory(parentDirectory || null)}
                >
                  ← Volver
                </button>
              )}
            </div>
          )}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-xl">{formatBreadcrumb(viewWeek)}</h2>
              <button
                type="button"
                onClick={handleCopyCurrentPath}
                className="text-sm px-2 py-1 border border-gray-300 rounded hover:bg-gray-100 disabled:opacity-50 dark:border-gray-700 dark:hover:bg-gray-800"
                title={
                  computedWindowsPath
                    ? `Copiar ruta: ${computedWindowsPath}`
                    : 'Configura la ruta base en ajustes para copiarla'
                }
                aria-label="Copiar ruta de la carpeta"
                disabled={!computedWindowsPath}
              >
                📋
              </button>
            </div>
            {routeScope.scope === 'subject' && subjectWeekOptions.length > 0 && (
              <div className="flex flex-col gap-1">
                <label
                  htmlFor={weekSelectId}
                  className="text-xs font-semibold uppercase text-gray-500"
                >
                  Semana
                </label>
                <select
                  id={weekSelectId}
                  className="border rounded px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-900"
                  value={selectedWeekValue}
                  onChange={(event) => {
                    const value = event.target.value
                    setViewWeek(value ? value : null)
                  }}
                >
                  {selectedWeekValue === '' && (
                    <option value="" disabled>
                      Selecciona una semana
                    </option>
                  )}
                  {subjectWeekOptions.map((option) => (
                    <option key={option.path} value={option.path}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          {otherChildDirectories.length > 0 && (
            <ul className="space-y-1">
              {otherChildDirectories.map((dir) => {
                const hasWeekSegment = pathContainsWeekSegment(dir)
                const quickLinkUrl = encodePathForQuickLink(dir)
                const normalizedDirKey = normalizePathSegments(dir)
                const alreadyLinked = quickLinks.some((link) => {
                  if (link.path && normalizePathSegments(link.path) === normalizedDirKey) {
                    return true
                  }
                  if (!quickLinkUrl) return false
                  const linkUrl = (link.url || '').toLowerCase()
                  return !!linkUrl && linkUrl === quickLinkUrl.toLowerCase()
                })
                const quickLinkDisabled =
                  hasWeekSegment || !quickLinkUrl || alreadyLinked || quickLinks.length >= QUICK_LINK_SLOT_COUNT
                const quickLinkTitle = hasWeekSegment
                  ? 'Las carpetas de Semana no generan enlaces personalizados'
                  : alreadyLinked
                    ? 'Esta carpeta ya está guardada en tus links rápidos'
                    : quickLinks.length >= QUICK_LINK_SLOT_COUNT
                      ? 'No hay espacios disponibles en los links rápidos'
                      : 'Agregar a links rápidos'
                return (
                  <li key={dir} className="font-bold flex items-center gap-2">
                    <button onClick={() => navigateToDirectory(dir)} className="flex-1 text-left">
                      {formatDirLabel(dir)}
                    </button>
                    {!hasWeekSegment && (
                      <button
                        type="button"
                        onClick={() => handleAddDirectoryQuickLink(dir)}
                        className="text-sm px-2 py-1 border border-gray-300 rounded hover:bg-gray-100 disabled:opacity-50 dark:border-gray-700 dark:hover:bg-gray-800"
                        title={quickLinkTitle}
                        aria-label={quickLinkTitle}
                        disabled={quickLinkDisabled}
                      >
                        🔗
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
          {showTheoryPractice ? (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-gray-500 uppercase">Teoría</h3>
                {theoryFiles.length ? (
                  renderCategorizedFileList(theoryFiles, 'theory')
                ) : (
                  <p className="text-xs text-gray-500">Sin archivos</p>
                )}
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-500 uppercase">Práctica</h3>
                {practiceDocuments.length ? (
                  renderCategorizedFileList(practiceDocuments, 'practice')
                ) : (
                  <p className="text-xs text-gray-500">Sin archivos</p>
                )}
              </div>
              {practiceVideoFiles.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-500 uppercase">Videos</h3>
                  {renderVideoList(practiceVideoFiles)}
                </div>
              )}
              <div>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setManualPropositionTitle('')
                        setManualPropositionUrl('')
                        setShowManualPropositionModal(true)
                      }}
                      className="text-sm font-semibold uppercase text-gray-500 transition-colors hover:text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:text-gray-400 dark:hover:text-gray-200"
                      title="Agregar proposición manualmente"
                    >
                      Proposiciones
                    </button>
                    <button
                      type="button"
                      onClick={handleToggleAllPropositions}
                      disabled={!hasActivePropositions}
                      className={`text-sm transition-colors ${
                        hasActivePropositions
                          ? 'cursor-pointer text-gray-700 hover:text-gray-900 dark:text-gray-200 dark:hover:text-white'
                          : 'cursor-not-allowed text-gray-400 dark:text-gray-500'
                      }`}
                      aria-label={propositionToggleLabel}
                      title={propositionToggleLabel}
                    >
                      {propositionStatusIcon}
                    </button>
                  </div>
                  <button
                    type="button"
                    className="rounded border border-gray-300 px-2 text-xs leading-6 dark:border-gray-600"
                    onClick={() => {
                      setNewPropositionTitle('')
                      setShowPropositionInput(true)
                      window.setTimeout(() => {
                        propositionInputRef.current?.focus()
                      }, 0)
                    }}
                    aria-label="Agregar proposición"
                  >
                    +
                  </button>
                </div>
                {showPropositionInput && (
                  <div className="mt-2 space-y-1">
                    <input
                      ref={propositionInputRef}
                      value={newPropositionTitle}
                      onChange={(event) => setNewPropositionTitle(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault()
                          void handleCreateProposition()
                        } else if (event.key === 'Escape') {
                          event.preventDefault()
                          handleCancelAddProposition()
                        }
                      }}
                      className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-gray-700 dark:bg-gray-900"
                      placeholder="Nombre de la proposición"
                      disabled={creatingProposition}
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {creatingProposition
                        ? 'Leyendo portapapeles...'
                        : 'Copia el enlace de la proposición y presiona Enter para guardarla.'}
                    </p>
                  </div>
                )}
                {activePropositions.length > 0 ? (
                  <ul className="mt-2 space-y-1">
                    {activePropositions.map((entry) => (
                      <li
                        key={entry.id}
                        className="flex items-center justify-between gap-2"
                      >
                        {editingPropositionId === entry.id ? (
                          <input
                            ref={editingPropositionInputRef}
                            value={editingPropositionTitle}
                            onChange={(event) =>
                              setEditingPropositionTitle(event.target.value)
                            }
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') {
                                event.preventDefault()
                                handleConfirmEditProposition(entry.id)
                              } else if (event.key === 'Escape') {
                                event.preventDefault()
                                handleCancelEditProposition()
                              }
                            }}
                            className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-gray-700 dark:bg-gray-900"
                            aria-label={`Editar nombre de la proposición ${entry.title}`}
                          />
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleOpenProposition(entry)}
                            className={`flex-1 text-left text-sm underline decoration-dotted hover:decoration-solid ${
                              entry.read ? 'text-gray-400 line-through' : ''
                            }`}
                          >
                            {entry.title}
                          </button>
                        )}
                        <div className="flex items-center gap-1">
                          {editingPropositionId === entry.id ? (
                            <>
                              <button
                                type="button"
                                onClick={() => handleConfirmEditProposition(entry.id)}
                                className="text-sm text-gray-400 transition-colors hover:text-green-500"
                                aria-label={`Guardar nombre de la proposición ${entry.title}`}
                              >
                                ✔
                              </button>
                              <button
                                type="button"
                                onClick={handleCancelEditProposition}
                                className="text-sm text-gray-400 transition-colors hover:text-gray-600"
                                aria-label="Cancelar edición de la proposición"
                              >
                                ✕
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => handleStartEditProposition(entry)}
                                className="text-sm text-gray-400 transition-colors hover:text-blue-500"
                                aria-label={`Renombrar proposición ${entry.title}`}
                              >
                                ✎
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRemoveProposition(entry)}
                                className="text-sm text-gray-400 transition-colors hover:text-red-500"
                                aria-label={`Eliminar proposición ${entry.title}`}
                              >
                                ✕
                              </button>
                            </>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : !showPropositionInput ? (
                  <p className="mt-2 text-xs text-gray-500">Sin proposiciones</p>
                ) : null}
                {!showPropositionInput && activePropositions.length === 0 && (
                  <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                    Copia el enlace de la proposición antes de presionar el botón "+" para guardarlo desde el portapapeles.
                  </p>
                )}
              </div>
              <div>
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-gray-500 uppercase">
                    Cuadernos
                  </h3>
                  <button
                    type="button"
                    className="rounded border border-gray-300 px-2 text-xs leading-6 dark:border-gray-600"
                    onClick={() => {
                      setNewNotebookName('')
                      setShowNotebookInput(true)
                    }}
                    aria-label="Agregar cuaderno"
                  >
                    +
                  </button>
                </div>
                {showNotebookInput && (
                  <div className="mt-2 space-y-1">
                    <input
                      ref={notebookInputRef}
                      value={newNotebookName}
                      onChange={(event) => setNewNotebookName(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault()
                          void handleCreateNotebook()
                        } else if (event.key === 'Escape') {
                          event.preventDefault()
                          handleCancelAddNotebook()
                        }
                      }}
                      className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-gray-700 dark:bg-gray-900"
                      placeholder="Nombre del cuaderno"
                      disabled={creatingNotebook}
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {creatingNotebook
                        ? 'Leyendo portapapeles...'
                        : 'Copia el enlace del cuaderno y presiona Enter para guardarlo.'}
                    </p>
                  </div>
                )}
                {activeNotebooks.length > 0 ? (
                  <ul className="mt-2 space-y-1">
                    {activeNotebooks.map((entry) => (
                      <li key={entry.id} className="flex items-center gap-2">
                        {editingNotebookId === entry.id ? (
                          <input
                            ref={editingNotebookInputRef}
                            value={editingNotebookName}
                            onChange={(event) =>
                              setEditingNotebookName(event.target.value)
                            }
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') {
                                event.preventDefault()
                                handleConfirmEditNotebook(entry.id)
                              } else if (event.key === 'Escape') {
                                event.preventDefault()
                                handleCancelEditNotebook()
                              }
                            }}
                            className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-gray-700 dark:bg-gray-900"
                            aria-label={`Editar nombre del cuaderno ${entry.name}`}
                          />
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleOpenNotebook(entry)}
                            className="flex-1 text-left text-sm underline decoration-dotted hover:decoration-solid"
                          >
                            {entry.name}
                          </button>
                        )}
                        <div className="flex items-center gap-1">
                          {editingNotebookId === entry.id ? (
                            <>
                              <button
                                type="button"
                                onClick={() => handleConfirmEditNotebook(entry.id)}
                                className="text-sm text-gray-400 transition-colors hover:text-green-500"
                                aria-label={`Guardar nombre del cuaderno ${entry.name}`}
                              >
                                ✔
                              </button>
                              <button
                                type="button"
                                onClick={handleCancelEditNotebook}
                                className="text-sm text-gray-400 transition-colors hover:text-gray-600"
                                aria-label="Cancelar edición del cuaderno"
                              >
                                ✕
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => handleStartEditNotebook(entry)}
                                className="text-sm text-gray-400 transition-colors hover:text-blue-500"
                                aria-label={`Renombrar cuaderno ${entry.name}`}
                              >
                                ✎
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRemoveNotebook(entry)}
                                className="text-sm text-gray-400 transition-colors hover:text-red-500"
                                aria-label={`Eliminar cuaderno ${entry.name}`}
                              >
                                ✕
                              </button>
                            </>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : !showNotebookInput ? (
                  <p className="mt-2 text-xs text-gray-500">Sin cuadernos</p>
                ) : null}
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
              !hasPracticeContent &&
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
                      navigateToDirectory(null)
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
                  autoPlay
                  className="w-full h-full"
                  src={videoUrl}
                  onEnded={handleVideoEnded}
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
          <button
            className="block w-full text-left"
            onClick={() => {
              setShowSettings(false)
              setGroqModelsError(null)
              setGroqModelError(null)
              setShowGroqModal(true)
            }}
          >
            Configurar modelo y promt
          </button>
          <button
            className="block w-full text-left"
            onClick={() => {
              setShowSettings(false)
              setShowPropositionModal(true)
            }}
          >
            Proposiciones
          </button>
          <button className="block w-full text-left" onClick={() => setShowDarkModal(true)}>Configurar modo oscuro</button>
          <form
            className="space-y-2 border-t border-dashed border-gray-200 pt-2 dark:border-gray-700"
            onSubmit={(event: FormEvent<HTMLFormElement>) => {
              event.preventDefault()
              handleSaveWindowsBasePath()
            }}
          >
            <label className="block text-xs font-semibold uppercase text-gray-500 dark:text-gray-400" htmlFor="windows-base-path">
              Ruta base (Windows)
            </label>
            <input
              id="windows-base-path"
              value={windowsBasePathDraft}
              onChange={(event) => setWindowsBasePathDraft(event.target.value)}
              className="w-full rounded border border-gray-300 px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-900"
              placeholder="C:\\Users\\Rafael\\Desktop\\gestor"
            />
            <div className="flex justify-end">
              <button
                type="submit"
                className="rounded border border-gray-300 px-2 py-1 text-xs dark:border-gray-600"
              >
                Guardar ruta
              </button>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Se utilizará para copiar la ruta completa de la carpeta actual.
            </p>
          </form>
        </div>
      )}
    </div>

    {showGroqModal && (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
        onClick={() => setShowGroqModal(false)}
      >
        <div
          className="w-full max-w-md space-y-4 rounded bg-white p-4 text-gray-800 shadow-lg dark:bg-gray-900 dark:text-gray-100"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">Configurar modelo y prompt</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Selecciona el modelo de visión de Groq y el prompt por defecto que se enviará a cada selección.
              </p>
            </div>
            <button className="text-sm underline" onClick={() => setShowGroqModal(false)}>
              Cerrar
            </button>
          </div>
          <div className="space-y-2">
            <label className="flex items-center justify-between gap-2 text-sm font-medium" htmlFor="groq-model">
              <span>Modelo</span>
              <button
                type="button"
                className="text-xs underline"
                onClick={() => {
                  void fetchGroqModels(true)
                }}
                disabled={groqLoadingModels}
              >
                {groqLoadingModels ? 'Sincronizando…' : '[recarga/sincronizar]'}
              </button>
            </label>
            <select
              id="groq-model"
              value={groqModel}
              onChange={(event) => setGroqModel(event.target.value)}
              className="w-full rounded border border-gray-300 bg-white p-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-950"
            >
              <option value="">Selecciona un modelo</option>
              {groqModels.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
            {groqModelError && (
              <p className="text-xs text-red-500" role="alert">
                {groqModelError}
              </p>
            )}
            {groqModelsError && (
              <p className="text-xs text-red-400" role="alert">
                {groqModelsError}
              </p>
            )}
            {!groqModels.length && !groqModelsError && (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Sincroniza para cargar los modelos disponibles.
              </p>
            )}
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="groq-prompt">
              Prompt
            </label>
            <textarea
              id="groq-prompt"
              value={groqPrompt}
              onChange={(event) => setGroqPrompt(event.target.value)}
              rows={4}
              className="w-full rounded border border-gray-300 bg-white p-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-950"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="groq-image-prompt">
              Prompt para imágenes
            </label>
            <textarea
              id="groq-image-prompt"
              value={groqImagePrompt}
              onChange={(event) => setGroqImagePrompt(event.target.value)}
              rows={3}
              className="w-full rounded border border-gray-300 bg-white p-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-950"
            />
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              className="px-3 py-1 border rounded text-sm dark:border-gray-600"
              onClick={() => setShowGroqModal(false)}
              disabled={groqSaving}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="px-3 py-1 rounded bg-indigo-600 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-60"
              onClick={handleSaveGroqConfig}
              disabled={groqSaving}
            >
              {groqSaving ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </div>
      </div>
    )}

    {showPropositionModal && (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
        onClick={() => setShowPropositionModal(false)}
      >
        <div
          className="w-full max-w-md space-y-4 rounded bg-white p-4 text-gray-800 shadow-lg dark:bg-gray-900 dark:text-gray-100"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">Configurar proposiciones</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Define la URL base para crear y abrir proposiciones.
              </p>
            </div>
            <button className="text-sm underline" onClick={() => setShowPropositionModal(false)}>
              Cerrar
            </button>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="proposition-base-url">
              URL base
            </label>
            <input
              id="proposition-base-url"
              type="url"
              value={propositionBaseUrlDraft}
              onChange={(event) => setPropositionBaseUrlDraft(event.target.value)}
              placeholder="https://example.com"
              className="w-full rounded border border-gray-300 bg-white p-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-950"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Se utilizará para abrir y crear nuevas proposiciones.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <button
              type="button"
              onClick={handleResetPropositionIds}
              disabled={!hasPropositions}
              className={`px-3 py-1 text-sm font-medium rounded border transition ${
                hasPropositions
                  ? 'border-red-200 text-red-600 hover:border-red-400 dark:border-red-400/40 dark:text-red-300'
                  : 'cursor-not-allowed border-gray-200 text-gray-400 dark:border-gray-700 dark:text-gray-500'
              }`}
            >
              Reset ids
            </button>
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                className="px-3 py-1 border rounded text-sm dark:border-gray-600"
                onClick={() => setShowPropositionModal(false)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="px-3 py-1 rounded bg-indigo-600 text-sm font-medium text-white hover:bg-indigo-500"
                onClick={handleSavePropositionSettings}
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      </div>
    )}

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
                  {link.url
                    ? formatQuickLinkUrlForDisplay(link.url)
                    : 'Configura este enlace en tu archivo config.json'}
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

    {showSaveViewerNoteModal && (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
        onClick={handleCancelSaveViewerNote}
      >
        <div
          className="w-full max-w-sm space-y-4 rounded bg-white p-4 text-gray-800 shadow-lg dark:bg-gray-900 dark:text-gray-100"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">Guardar nota temporal</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Asigna un nombre para guardar la nota en cuadernos y recuperarla rápidamente.
              </p>
            </div>
            <button
              type="button"
              className="text-sm underline"
              onClick={handleCancelSaveViewerNote}
            >
              Cerrar
            </button>
          </div>
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
                Nombre
              </label>
              <input
                ref={saveViewerNoteInputRef}
                value={viewerNoteDraftName}
                onChange={(event) => setViewerNoteDraftName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    handleConfirmSaveViewerNote()
                  } else if (event.key === 'Escape') {
                    event.preventDefault()
                    handleCancelSaveViewerNote()
                  }
                }}
                placeholder="Nombre de la nota"
                className="w-full rounded border border-gray-300 bg-white p-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-950"
              />
            </div>
            {pendingViewerNote?.text && (
              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
                  Vista previa
                </label>
                <div className="max-h-40 whitespace-pre-wrap overflow-y-auto rounded border border-gray-200 bg-gray-50 p-2 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200">
                  {pendingViewerNote.text}
                </div>
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="rounded border border-gray-300 px-3 py-1 text-sm dark:border-gray-600"
              onClick={handleCancelSaveViewerNote}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="rounded bg-indigo-600 px-3 py-1 text-sm text-white transition hover:bg-indigo-700"
              onClick={handleConfirmSaveViewerNote}
            >
              Guardar
            </button>
          </div>
        </div>
      </div>
    )}

    {showManualPropositionModal && (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
        onClick={handleCloseManualPropositionModal}
      >
        <div
          className="w-full max-w-sm space-y-4 rounded bg-white p-4 text-gray-800 shadow-lg dark:bg-gray-900 dark:text-gray-100"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">Agregar proposición</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Completa el nombre y el enlace para guardarla manualmente.
              </p>
            </div>
            <button
              type="button"
              className="text-sm underline"
              onClick={handleCloseManualPropositionModal}
            >
              Cerrar
            </button>
          </div>
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
                Nombre
              </label>
              <input
                ref={manualPropositionTitleRef}
                value={manualPropositionTitle}
                onChange={(event) => setManualPropositionTitle(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    handleConfirmManualProposition()
                  } else if (event.key === 'Escape') {
                    event.preventDefault()
                    handleCloseManualPropositionModal()
                  }
                }}
                placeholder="Nombre de la proposición"
                className="w-full rounded border border-gray-300 bg-white p-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-950"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
                Enlace
              </label>
              <input
                type="url"
                value={manualPropositionUrl}
                onChange={(event) => setManualPropositionUrl(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    handleConfirmManualProposition()
                  } else if (event.key === 'Escape') {
                    event.preventDefault()
                    handleCloseManualPropositionModal()
                  }
                }}
                placeholder="https://…"
                className="w-full rounded border border-gray-300 bg-white p-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-950"
              />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              className="text-sm text-gray-500 underline dark:text-gray-400"
              onClick={handleCloseManualPropositionModal}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="rounded bg-indigo-600 px-3 py-1 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-60"
              onClick={handleConfirmManualProposition}
              disabled={!manualPropositionTitle.trim() || !manualPropositionUrl.trim()}
            >
              Confirmar
            </button>
          </div>
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




