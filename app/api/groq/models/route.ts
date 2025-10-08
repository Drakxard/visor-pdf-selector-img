import { NextResponse } from "next/server"

const GROQ_MODELS_URL = "https://api.groq.com/openai/v1/models"

export const dynamic = "force-dynamic"

export async function GET() {
  const apiKey = process.env.GROQ_API_KEY_CUSTOM
  if (!apiKey) {
    return NextResponse.json(
      { error: "GROQ_API_KEY_CUSTOM no está configurada." },
      { status: 500 },
    )
  }

  try {
    const response = await fetch(GROQ_MODELS_URL, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    })

    if (!response.ok) {
      let message = "No se pudieron obtener los modelos disponibles."
      try {
        const data = await response.json()
        if (data && typeof data.error === "string") {
          message = data.error
        }
      } catch {}
      return NextResponse.json({ error: message }, { status: response.status })
    }

    const payload = await response.json()
    const models: string[] = Array.isArray(payload?.data)
      ? payload.data
          .map((entry: unknown) => {
            if (typeof entry === "string") return entry.trim()
            if (entry && typeof entry === "object" && "id" in entry) {
              const id = (entry as { id?: unknown }).id
              return typeof id === "string" ? id.trim() : null
            }
            return null
          })
          .filter((id: string | null): id is string => !!id)
      : []

    return NextResponse.json({ models })
  } catch (error) {
    console.error("Error fetching Groq models", error)
    return NextResponse.json(
      { error: "Error interno obteniendo los modelos de Groq." },
      { status: 500 },
    )
  }
}
