import { z } from 'zod'
import { generateQianwenTextStream } from '@/src/lib/qianwen'

interface ArticleRequestBody {
  topic?: string
  language?: string
  style?: string
  length?: string
  stream?: boolean
}

const ArticleSchema = z.object({
  title: z.string(),
  outline: z.array(z.string()),
  content: z.string(),
})

type StructuredArticle = z.infer<typeof ArticleSchema>

const MAX_RETRIES = 2
const STREAM_CHUNK_SIZE = 1024

type ArticleErrorCode = 'JSON_PARSE_ERROR' | 'SCHEMA_VALIDATION_ERROR' | 'LLM_ERROR'

class ArticleError extends Error {
  code: ArticleErrorCode

  constructor(code: ArticleErrorCode, message: string) {
    super(message)
    this.code = code
  }
}

function buildArticlePrompt(payload: ArticleRequestBody, attempt: number, errorMessage?: string) {
  const language = payload.language?.trim() || 'Chinese'
  const style = payload.style?.trim()
  const length = payload.length?.trim()

  const lines = [
    'You are a structured article generator.',
    'Return ONLY a strict JSON object with the following schema:',
    '{"title":"","outline":["..."],"content":""}',
    'Do not include any extra text, comments, or code fences.',
    'All values must be strings except outline which is an array of strings.',
    `Language: ${language}.`,
  ]

  if (style) {
    lines.push(`Style: ${style}.`)
  }
  if (length) {
    lines.push(`Length: ${length}.`)
  }

  if (attempt > 0 && errorMessage) {
    lines.push(`Previous output was invalid JSON: ${errorMessage}. Retry with strict JSON only.`)
  }

  return lines.join('\n')
}

function parseStrictJson(raw: string): StructuredArticle {
  const trimmed = raw.trim()
  if (!trimmed) {
    throw new ArticleError('JSON_PARSE_ERROR', 'EMPTY_OUTPUT')
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed) as unknown
  }
  catch (error) {
    throw new ArticleError(
      'JSON_PARSE_ERROR',
      error instanceof Error ? error.message : 'INVALID_JSON',
    )
  }

  const result = ArticleSchema.safeParse(parsed)
  if (!result.success) {
    throw new ArticleError('SCHEMA_VALIDATION_ERROR', 'SCHEMA_MISMATCH')
  }

  return result.data
}

async function generateArticleOnce(payload: ArticleRequestBody, attempt: number, errorMessage?: string) {
  const systemPrompt = buildArticlePrompt(payload, attempt, errorMessage)

  const messages = [
    { role: 'system' as const, content: systemPrompt },
    { role: 'user' as const, content: `Topic: ${payload.topic}` },
  ]

  try {
    let raw = ''
    for await (const event of generateQianwenTextStream({ messages: messages as any })) {
      if (event.type === 'text') {
        raw += event.content
      }
    }

    return raw
  }
  catch (error) {
    throw new ArticleError(
      'LLM_ERROR',
      error instanceof Error ? error.message : 'LLM_ERROR',
    )
  }
}

async function generateStructuredArticle(payload: ArticleRequestBody) {
  let lastError = 'UNKNOWN'
  let lastErrorCode: ArticleErrorCode | null = null

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    const raw = await generateArticleOnce(payload, attempt, lastError)

    try {
      return parseStrictJson(raw)
    }
    catch (error) {
      const message = error instanceof Error ? error.message : 'VALIDATION_ERROR'
      const code = error instanceof ArticleError ? error.code : 'SCHEMA_VALIDATION_ERROR'
      lastErrorCode = code
      lastError = message
      console.warn('[article] structure validation failed', {
        attempt: attempt + 1,
        error: message,
        code,
      })
    }
  }

  throw new ArticleError(lastErrorCode ?? 'SCHEMA_VALIDATION_ERROR', `STRUCTURE_FAILED: ${lastError}`)
}

function streamJsonResponse(jsonText: string) {
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let i = 0; i < jsonText.length; i += STREAM_CHUNK_SIZE) {
        const chunk = jsonText.slice(i, i + STREAM_CHUNK_SIZE)
        controller.enqueue(encoder.encode(chunk))
      }
      controller.close()
    },
  })

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  })
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as ArticleRequestBody
    const topic = body.topic?.trim() ?? ''

    if (!topic) {
      return new Response(
        JSON.stringify({ error: 'INVALID_REQUEST', message: 'topic is required' }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
          },
        },
      )
    }

    const article = await generateStructuredArticle({
      topic,
      language: body.language,
      style: body.style,
      length: body.length,
      stream: body.stream,
    })

    const jsonText = JSON.stringify(article)

    if (body.stream) {
      return streamJsonResponse(jsonText)
    }

    return new Response(jsonText, {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
      },
    })
  }
  catch (error: unknown) {
    return new Response(
      JSON.stringify({
        error: error instanceof ArticleError ? error.code : 'SERVER_ERROR',
        message: error instanceof Error ? error.message : 'SERVER_ERROR',
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
        },
      },
    )
  }
}
