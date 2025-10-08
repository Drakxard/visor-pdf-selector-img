import { NextResponse } from 'next/server'

const GROQ_CHAT_URL = 'https://api.groq.com/openai/v1/chat/completions'

type GroqTranscribeRequest = {
  image?: string
  model?: string
  prompt?: string
}

export async function POST(request: Request) {
  const apiKey = process.env.GROQ_API_KEY_CUSTOM
  if (!apiKey) {
    return NextResponse.json(
      { error: 'GROQ_API_KEY_CUSTOM no está configurado en el servidor' },
      { status: 500 },
    )
  }

  let body: GroqTranscribeRequest
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Solicitud inválida' }, { status: 400 })
  }

  if (!body?.image || !body?.model) {
    return NextResponse.json({ error: 'Faltan parámetros requeridos' }, { status: 400 })
  }

  const payload = {
    model: body.model,
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: body.prompt || 'Extrae el texto.' },
          {
            type: 'image_url',
            image_url: {
              url: body.image,
            },
          },
        ],
      },
    ],
  }

  try {
    const response = await fetch(GROQ_CHAT_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    const data = await response.json().catch(() => ({}))

    if (!response.ok) {
      const message = data?.error?.message || data?.error || 'Error al solicitar transcripción a GROQ'
      return NextResponse.json({ error: message }, { status: response.status || 500 })
    }

    const text = data?.choices?.[0]?.message?.content || ''
    return NextResponse.json({ text })
  } catch (error) {
    console.error('Error transcribiendo con GROQ:', error)
    return NextResponse.json(
      { error: 'No se pudo completar la transcripción con GROQ' },
      { status: 502 },
    )
  }
}

