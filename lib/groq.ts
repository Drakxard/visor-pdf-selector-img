export const DEFAULT_GROQ_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct"

export const DEFAULT_GROQ_PROMPT = `Extrae el texto principal del contenido y devuelve únicamente un JSON válido con la siguiente estructura exacta:

{
  "texto": "contenido extraído"
}

No agregues texto adicional, ni explicaciones, ni bloques de código, ni comillas triples.
No devuelvas varios objetos.
Tu respuesta completa debe ser un único objeto JSON válido.`

export const DEFAULT_GROQ_IMAGE_PROMPT = "Transcribe el texto de la imagen"
