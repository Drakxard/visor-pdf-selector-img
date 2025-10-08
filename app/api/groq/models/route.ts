import { NextResponse } from 'next/server'

const GROQ_BASE_URL = 'https://api.groq.com/openai/v1/models'

export async function GET() {
  const apiKey = process.env.GROQ_API_KEY_CUSTOM
  if (!apiKey) {
    return NextResponse.json(
      { error: 'GROQ_API_KEY_CUSTOM no está configurado en el servidor' },
      { status: 500 },
    )
  }

  try {
    const response = await fetch(GROQ_BASE_URL, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    })

    const data = await response.json().catch(() => ({}))

    if (!response.ok) {
      const message = data?.error?.message || data?.error || 'Error obteniendo modelos de GROQ'
      return NextResponse.json({ error: message }, { status: response.status || 500 })
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('Error consultando modelos de GROQ:', error)
    return NextResponse.json(
      { error: 'No se pudieron obtener los modelos de GROQ' },
      { status: 502 },
    )
  }
}

