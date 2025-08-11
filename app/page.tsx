"use client"

import { useEffect, useState } from "react"
import { useTheme } from "next-themes"

export default function Home() {
  const [started, setStarted] = useState(false)
  const [hasSchedule, setHasSchedule] = useState(true)
  const { setTheme } = useTheme()

  useEffect(() => {
    const hour = new Date().getHours()
    if (hour >= 19 || hour < 6) {
      setTheme("dark")
    } else {
      setTheme("light")
    }
    const stored = localStorage.getItem("hasSchedule")
    if (!stored) setHasSchedule(false)
  }, [setTheme])

  useEffect(() => {
    const handler = () => setStarted(true)
    if (!started) {
      window.addEventListener("keydown", handler)
      return () => window.removeEventListener("keydown", handler)
    }
  }, [started])

  if (!started) {
    const hour = new Date().getHours()
    const greeting = hour >= 19 || hour < 6 ? "Buenas noches" : "Buenos días"
    return (
      <main className="min-h-screen flex items-center justify-center text-2xl">
        <p>{greeting}. Presiona cualquier tecla para continuar.</p>
      </main>
    )
  }

  if (!hasSchedule) {
    const handleUpload = () => {
      localStorage.setItem("hasSchedule", "1")
      setHasSchedule(true)
    }
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-4 p-4">
        <p>Paso 0: Sube tu cronograma (Excel).</p>
        <input type="file" accept=".xlsx,.xls" onChange={handleUpload} />
      </main>
    )
  }

  return (
    <main className="grid grid-cols-2 min-h-screen">
      <aside className="border-r p-4 space-y-2">
        <h2 className="text-xl">Semanas</h2>
        <ul className="space-y-1">
          <li className="font-bold">Semana 1</li>
          <li className="opacity-50">Semana 2 🔒</li>
          <li className="opacity-50">Semana 3 🔒</li>
        </ul>
      </aside>
      <section>
        <iframe
          title="Visor PDF avanzado"
          src="/visor/index.html"
          className="w-full h-screen border-0"
        />
      </section>
    </main>
  )
}
