import { NextResponse } from "next/server"

import { DEFAULT_GROQ_PROMPT } from "@/lib/groq"

const GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions"

const JSON_ESCAPE_CHARS = new Set(['"', "\\", "/", "b", "f", "n", "r", "t", "u"])

const collapseLatexBackslashes = (value: string) => {
  if (!value.includes("\\")) return value

  let result = ""
  let index = 0

  while (index < value.length) {
    const char = value[index]
    if (char !== "\\") {
      result += char
      index += 1
      continue
    }

    let nextIndex = index + 1
    while (nextIndex < value.length && value[nextIndex] === "\\") {
      nextIndex += 1
    }

    const runLength = nextIndex - index
    if (runLength === 1) {
      result += "\\"
    } else {
      const following = value[nextIndex] ?? ""
      if (following && JSON_ESCAPE_CHARS.has(following)) {
        result += "\\".repeat(runLength)
      } else {
        result += "\\"
      }
    }

    index = nextIndex
  }

  return result
}

const DAILY_LIMIT = 100

type DailyUsage = {
  date: string
  count: number
}

const rateLimitState = (() => {
  const globalKey = "__groq_transcribe_rate_limit__" as const
  const globalObj = globalThis as typeof globalThis & {
    [globalKey]?: DailyUsage
  }

  if (!globalObj[globalKey]) {
    globalObj[globalKey] = { date: new Date().toISOString().slice(0, 10), count: 0 }
  }

  return {
    get state() {
      const currentDate = new Date().toISOString().slice(0, 10)
      const state = globalObj[globalKey]!
      if (state.date !== currentDate) {
        state.date = currentDate
        state.count = 0
      }
      return state
    },
  }
})()

export const dynamic = "force-dynamic"
export const maxDuration = 60

interface TranscribeRequest {
  model?: string
  prompt?: string
  images?: unknown
}

export async function POST(request: Request) {
  const apiKey = process.env.GROQ_API_KEY_CUSTOM
  if (!apiKey) {
    return NextResponse.json(
      { error: "GROQ_API_KEY_CUSTOM no está configurada." },
      { status: 500 },
    )
  }

  const usage = rateLimitState.state
  if (usage.count >= DAILY_LIMIT) {
    return NextResponse.json(
      { error: "Se alcanzó el límite diario de uso." },
      { status: 429 },
    )
  }

  let body: TranscribeRequest
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 })
  }

  const model = typeof body.model === "string" ? body.model.trim() : ""
  const prompt = typeof body.prompt === "string" ? body.prompt : ""
  const images = Array.isArray(body.images) ? body.images : []

  if (!model) {
    return NextResponse.json({ error: "Modelo no especificado." }, { status: 400 })
  }

  if (!images.length) {
    return NextResponse.json({ error: "No se recibieron imágenes para transcribir." }, { status: 400 })
  }

  const normalizedImages = images
    .map((image) => (typeof image === "string" ? image.trim() : ""))
    .filter((image): image is string => image.length > 0)

  if (!normalizedImages.length) {
    return NextResponse.json({ error: "Las imágenes proporcionadas no son válidas." }, { status: 400 })
  }

  const promptText = prompt.trim() || DEFAULT_GROQ_PROMPT

  const results: string[] = []

  usage.count += 1

  for (const image of normalizedImages) {
    const imageUrl = image.startsWith("data:") ? image : `data:image/png;base64,${image}`
    try {
      const response = await fetch(GROQ_CHAT_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: promptText },
                { type: "image_url", image_url: { url: imageUrl } },
              ],
            },
          ],
          max_tokens: 1024,
        }),
      })

      if (!response.ok) {
        let message = `Error al procesar la imagen (${response.status}).`
        try {
          const errorData = await response.json()
          if (errorData && typeof errorData.error === "string") {
            message = errorData.error
          }
        } catch {}
        return NextResponse.json({ error: message }, { status: response.status })
      }

      const data = await response.json()
      const choice = Array.isArray(data?.choices) ? data.choices[0] : undefined
      const content = choice?.message?.content

      if (typeof content === "string") {
        results.push(collapseLatexBackslashes(content))
      } else if (Array.isArray(content)) {
        const text = content
          .map((part: unknown) => {
            if (typeof part === "string") return part
            if (part && typeof part === "object" && "text" in part) {
              const value = (part as { text?: unknown }).text
              return typeof value === "string" ? value : ""
            }
            return ""
          })
          .filter(Boolean)
          .join(" ")
        results.push(collapseLatexBackslashes(text))
      } else {
        results.push("")
      }
    } catch (error) {
      console.error("Error calling Groq vision API", error)
      return NextResponse.json(
        { error: "Error interno al comunicarse con Groq." },
        { status: 500 },
      )
    }
  }

  return NextResponse.json({ transcriptions: results })
}
