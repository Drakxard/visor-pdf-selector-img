import { NextResponse } from "next/server"

import { DEFAULT_GROQ_PROMPT } from "@/lib/groq"

const MS_IN_DAY = 24 * 60 * 60 * 1000
const DEFAULT_DAILY_LIMIT = 100

type UsageState = {
  count: number
  resetAt: number
}

declare global {
  // eslint-disable-next-line no-var
  var __groqTranscribeUsage?: UsageState
}

function getDailyLimit() {
  const envLimit = Number(process.env.GROQ_TRANSCRIBE_DAILY_LIMIT)
  if (Number.isFinite(envLimit) && envLimit > 0) {
    return Math.floor(envLimit)
  }
  return DEFAULT_DAILY_LIMIT
}

function getUsageState(): UsageState {
  const now = Date.now()
  let state = globalThis.__groqTranscribeUsage

  if (!state || now >= state.resetAt) {
    const startOfTomorrow = new Date()
    startOfTomorrow.setUTCHours(0, 0, 0, 0)
    const resetAt = startOfTomorrow.getTime() + MS_IN_DAY
    state = { count: 0, resetAt }
    globalThis.__groqTranscribeUsage = state
  }

  return state
}

function assertWithinLimit() {
  const state = getUsageState()
  const limit = getDailyLimit()

  if (state.count >= limit) {
    throw new Error("DAILY_LIMIT_REACHED")
  }

  state.count += 1
}

const GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions"

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

  try {
    assertWithinLimit()
  } catch (error) {
    if (error instanceof Error && error.message === "DAILY_LIMIT_REACHED") {
      return NextResponse.json(
        { error: "Se alcanzó el límite diario de uso." },
        { status: 429 },
      )
    }
    throw error
  }

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
        results.push(content)
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
        results.push(text)
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
