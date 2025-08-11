"use client"

import { useEffect, useState } from "react"
import { useTheme } from "next-themes"
import { Button } from "@/components/ui/button"
import { Lock } from "lucide-react"

type Stage = "welcome" | "upload" | "main"

export default function Home() {
  const { setTheme } = useTheme()
  const [stage, setStage] = useState<Stage>("welcome")
  const [greeting, setGreeting] = useState("")
  const [files, setFiles] = useState<File[]>([])

  useEffect(() => {
    const hour = new Date().getHours()
    if (hour >= 19 || hour < 7) {
      setTheme("dark")
      setGreeting("Buenas noches")
    } else {
      setTheme("light")
      setGreeting("Buenos días")
    }

    const hasSchedule = localStorage.getItem("scheduleUploaded") === "true"
    const handleKey = () => {
      window.removeEventListener("keydown", handleKey)
      setStage(hasSchedule ? "main" : "upload")
    }
    window.addEventListener("keydown", handleKey)
    return () => window.removeEventListener("keydown", handleKey)
  }, [setTheme])

  const handleConfirm = () => {
    if (!files.length) return
    localStorage.setItem("scheduleUploaded", "true")
    setStage("main")
  }

  if (stage === "welcome") {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-2xl text-center">
          {greeting}. Presiona cualquier tecla para continuar.
        </p>
      </main>
    )
  }

  if (stage === "upload") {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-xl">Sube tus cronogramas (excel)</p>
        <input
          type="file"
          multiple
          accept=".xls,.xlsx"
          onChange={(e) => setFiles(Array.from(e.target.files || []))}
        />
        {files.length > 0 && (
          <Button onClick={handleConfirm}>Confirmar</Button>
        )}
      </main>
    )
  }

  const weeks = Array.from({ length: 12 }, (_, i) => i + 1)

  return (
    <main className="min-h-screen grid grid-cols-1 md:grid-cols-2">
      <aside className="border-r p-4 space-y-2">
        {weeks.map((week) => (
          <div
            key={week}
            className="flex items-center justify-between p-2 border rounded"
          >
            <span>Semana {week}</span>
            {week === 1 ? null : <Lock className="w-4 h-4 opacity-50" />}
          </div>
        ))}
      </aside>
      <section className="p-4 flex flex-col gap-2">
        <div>
          <h2 className="text-lg font-semibold">Actual</h2>
          <p className="text-sm text-muted-foreground">
            Selecciona un PDF para comenzar.
          </p>
        </div>
        <iframe
          src="/visor/index.html"
          className="flex-1 w-full border"
          title="Visor PDF"
        />
      </section>
    </main>
  )
}

