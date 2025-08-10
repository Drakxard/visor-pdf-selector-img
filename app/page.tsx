"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { FolderOpen, Play, ArrowRight, ArrowLeft, Files, Info, RefreshCw } from 'lucide-react'

// Tipos para manejar entradas de PDF de carpeta o como fallback (webkitdirectory)
type PDFEntry = {
  name: string
  handle?: FileSystemFileHandle
  file?: File
}

// Natural sort por nombre de archivo para ordenar 01, 02, 10 correctamente
function naturalCompare(a: string, b: string) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })
}

function isPDF(name: string) {
  return name.toLowerCase().endsWith(".pdf")
}

export default function Home() {
  const [entries, setEntries] = useState<PDFEntry[]>([])
  const [currentIndex, setCurrentIndex] = useState<number | null>(null)
  const [currentPage, setCurrentPage] = useState<number>(1)
  const [totalPages, setTotalPages] = useState<number>(0)
  const [loadingDoc, setLoadingDoc] = useState(false)
  const [loadingPage, setLoadingPage] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // refs para PDF.js y canvas
  const pdfLibRef = useRef<any>(null)
  const pdfDocRef = useRef<any>(null)
  const cancelRenderRef = useRef<(() => void) | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const inputDirRef = useRef<HTMLInputElement | null>(null)

  // Preparar input webkitdirectory como alternativa si showDirectoryPicker no está disponible
  useEffect(() => {
    if (inputDirRef.current) {
      // Algunos navegadores necesitan este atributo para permitir seleccionar carpetas
      inputDirRef.current.setAttribute("webkitdirectory", "")
      inputDirRef.current.setAttribute("directory", "")
    }
  }, [])

  // Cargar PDF.js de forma dinámica para evitar problemas de worker y SSR
  useEffect(() => {
    let mounted = true
    const load = async () => {
      try {
        const pdfjsLib = await import("pdfjs-dist/build/pdf")
        // Ajusta la versión si lo prefieres (probada)
        pdfjsLib.GlobalWorkerOptions.workerSrc =
          "https://unpkg.com/pdfjs-dist@2.16.105/build/pdf.worker.min.js"
        if (mounted) {
          pdfLibRef.current = pdfjsLib
        }
      } catch (e: any) {
        console.error("Error cargando PDF.js:", e)
        setError("No se pudo cargar el motor PDF")
      }
    }
    load()
    return () => {
      mounted = false
    }
  }, [])

  // Orden visible de archivos
  const orderedEntries = useMemo(() => {
    return [...entries].sort((a, b) => naturalCompare(a.name, b.name))
  }, [entries])

  const currentFileName = useMemo(() => {
    if (currentIndex == null) return null
    return orderedEntries[currentIndex]?.name ?? null
  }, [currentIndex, orderedEntries])

  const resetViewer = useCallback(async () => {
    // Cancelar render en curso
    if (cancelRenderRef.current) {
      try {
        cancelRenderRef.current()
      } catch {}
      cancelRenderRef.current = null
    }
    // Destruir doc actual
    if (pdfDocRef.current) {
      try {
        await pdfDocRef.current.destroy()
      } catch {}
      pdfDocRef.current = null
    }
    setTotalPages(0)
    setCurrentPage(1)
  }, [])

  const pickFolder = useCallback(async () => {
    setError(null)
    setEntries([])
    setCurrentIndex(null)
    try {
      // @ts-expect-error: showDirectoryPicker puede no existir en TS pero sí en runtime
      if (!window.showDirectoryPicker) {
        // Fallback: disparar input webkitdirectory
        inputDirRef.current?.click()
        return
      }

      const dirHandle: FileSystemDirectoryHandle = await (window as any).showDirectoryPicker({
        mode: "read"
      })

      const found: PDFEntry[] = []
      // Recorrer solo el primer nivel de la carpeta
      // @ts-ignore: TypeScript no conoce correctamente entries() asíncrono
      for await (const [name, handle] of (dirHandle as any).entries()) {
        if (handle.kind === "file" && isPDF(name)) {
          found.push({ name, handle })
        }
      }

      if (!found.length) {
        setError("La carpeta no contiene archivos PDF.")
        return
      }

      setEntries(found)
    } catch (e: any) {
      if (e?.name === "AbortError") return
      console.error(e)
      setError("No se pudo acceder a la carpeta.")
    }
  }, [])

  const onFallbackFolder = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null)
    const files = Array.from(e.target.files ?? []).filter((f) => isPDF(f.name))
    if (!files.length) {
      setError("La carpeta seleccionada no contiene PDFs.")
      return
    }
    const list: PDFEntry[] = files.map((f) => ({ name: f.name, file: f }))
    setEntries(list)
  }, [])

  // Cargar un PDF por índice
  const loadPdfByIndex = useCallback(
    async (index: number) => {
      if (index < 0 || index >= orderedEntries.length) return
      if (!pdfLibRef.current) {
        setError("PDF.js aún no está listo.")
        return
      }
      setLoadingDoc(true)
      setError(null)
      await resetViewer()

      try {
        const entry = orderedEntries[index]
        let arrayBuffer: ArrayBuffer
        if (entry.handle) {
          const file = await entry.handle.getFile()
          arrayBuffer = await file.arrayBuffer()
        } else if (entry.file) {
          arrayBuffer = await entry.file.arrayBuffer()
        } else {
          throw new Error("Entrada de PDF inválida.")
        }

        const loadingTask = pdfLibRef.current.getDocument({ data: arrayBuffer })
        const pdf = await loadingTask.promise
        pdfDocRef.current = pdf
        setCurrentIndex(index)
        setTotalPages(pdf.numPages)
        setCurrentPage(1)
      } catch (e: any) {
        console.error("Error cargando PDF:", e)
        setError("No se pudo abrir el PDF.")
      } finally {
        setLoadingDoc(false)
      }
    },
    [orderedEntries, resetViewer]
  )

  // Renderizar una página actual cuando cambie el PDF, la página o el tamaño
  const renderCurrentPage = useCallback(async () => {
    if (!pdfDocRef.current || !canvasRef.current || !containerRef.current) return
    if (!currentPage) return

    setLoadingPage(true)
    setError(null)

    // Cancelación simple: cambiar flag local si llega una nueva renderización
    let cancelled = false
    cancelRenderRef.current = () => {
      cancelled = true
    }

    try {
      const page = await pdfDocRef.current.getPage(currentPage)
      if (cancelled) return

      const containerWidth = Math.max(320, containerRef.current.clientWidth)
      const baseViewport = page.getViewport({ scale: 1 })
      // Fit width
      const scale = Math.max(0.5, Math.min(2.5, (containerWidth - 24) / baseViewport.width))
      const viewport = page.getViewport({ scale })

      const canvas = canvasRef.current
      const ctx = canvas.getContext("2d")
      if (!ctx) throw new Error("Canvas no disponible")

      const ratio = window.devicePixelRatio || 1
      canvas.width = Math.floor(viewport.width * ratio)
      canvas.height = Math.floor(viewport.height * ratio)
      canvas.style.width = `${viewport.width}px`
      canvas.style.height = `${viewport.height}px`

      ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
      const renderTask = page.render({
        canvasContext: ctx,
        viewport
      })
      await renderTask.promise

      if (!cancelled) {
        // ok
      }
    } catch (e: any) {
      if (!cancelled) {
        console.error("Error renderizando página:", e)
        setError("No se pudo renderizar la página.")
      }
    } finally {
      if (!cancelled) setLoadingPage(false)
    }
  }, [currentPage])

  // Re-render cuando cambien dependencias clave
  useEffect(() => {
    renderCurrentPage()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renderCurrentPage, totalPages, currentIndex])

  // Re-render al redimensionar
  useEffect(() => {
    const onResize = () => {
      renderCurrentPage()
    }
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [renderCurrentPage])

  // Navegación entre páginas y PDFs
  const canStart = entries.length > 0
  const hasDoc = currentIndex != null && pdfDocRef.current
  const canPrev =
    hasDoc && (currentPage > 1 || (currentPage === 1 && (currentIndex ?? 0) > 0))
  const canNext =
    hasDoc &&
    (currentPage < totalPages ||
      (currentPage === totalPages && (currentIndex ?? 0) < orderedEntries.length - 1))

  const goStart = useCallback(() => {
    if (!canStart) return
    loadPdfByIndex(0)
  }, [canStart, loadPdfByIndex])

  const goPrev = useCallback(async () => {
    if (!hasDoc) return
    // Si no estamos en la primera página, retroceder página
    if (currentPage > 1) {
      setCurrentPage((p) => p - 1)
      return
    }
    // Si estamos en la primera página, ir al PDF anterior y saltar a su última página
    const prevIndex = (currentIndex as number) - 1
    if (prevIndex >= 0) {
      await loadPdfByIndex(prevIndex)
      // Esperar a que se ajuste totalPages
      setTimeout(() => {
        setCurrentPage((_) => (pdfDocRef.current ? pdfDocRef.current.numPages : 1))
      }, 0)
    }
  }, [hasDoc, currentPage, currentIndex, loadPdfByIndex])

  const goNext = useCallback(async () => {
    if (!hasDoc) return
    // Si no estamos en la última página, avanzar página
    if (currentPage < totalPages) {
      setCurrentPage((p) => p + 1)
      return
    }
    // Si estamos en la última página, ir al siguiente PDF y saltar a su primera página
    const nextIndex = (currentIndex as number) + 1
    if (nextIndex < orderedEntries.length) {
      await loadPdfByIndex(nextIndex)
      // Primera página por defecto
    }
  }, [hasDoc, currentPage, totalPages, currentIndex, orderedEntries.length, loadPdfByIndex])

  // Atajos de teclado: ← y → cruzan PDFs según el estado
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault()
        if (canPrev) goPrev()
      }
      if (e.key === "ArrowRight") {
        e.preventDefault()
        if (canNext) goNext()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [canPrev, canNext, goPrev, goNext])

  const selectedCount = entries.length
  const hintText =
    "Usa ← y → para avanzar y retroceder. En la última página de un PDF saltas al siguiente; en la primera, al anterior."

  return (
    <main className="min-h-screen">
      <iframe
        title="Visor PDF avanzado"
        src="/visor/index.html"
        className="w-full h-screen border-0"
      />
    </main>
  )
}

/**
 * Pequeño helper para disparar efectos imperativos cuando un "when" cambia,
 * sin forzar re-render del componente principal.
 */
function RenderEffect({
  when,
  onEffect
}: {
  when: string | number | boolean
  onEffect: () => void
}) {
  const prev = useRef<string | number | boolean | null>(null)
  useEffect(() => {
    if (prev.current !== when) {
      prev.current = when
      onEffect()
    }
  }, [when, onEffect])
  return null
}
