import { DEFAULT_CHAT_MODEL } from '@/src/lib/llm'
import { isSupportedChatModel } from '@/src/lib/llm/models'
import { generateChatStream } from '@/src/server/chat/chat-orchestrator'

export const runtime = 'nodejs'

interface ChatRequestBody {
  message?: string
  model?: string
}

function createInvalidRequestResponse() {
  return new Response(
    JSON.stringify({ error: 'INVALID_REQUEST' }),
    {
      status: 400,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
      },
    },
  )
}

function createServerErrorResponse(error: unknown) {
  return new Response(
    JSON.stringify({
      error: error instanceof Error ? error.message : 'SERVER_ERROR',
    }),
    {
      status: 500,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
      },
    },
  )
}

// Route Handler 只保留协议层职责：校验请求、启动流、返回 HTTP 响应。
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as ChatRequestBody
    const userMessage = body.message?.trim() ?? ''
    const requestedModel = body.model?.trim() ?? ''
    const selectedModel = isSupportedChatModel(requestedModel) ? requestedModel : DEFAULT_CHAT_MODEL

    if (userMessage.length === 0) {
      return createInvalidRequestResponse()
    }

    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const event of generateChatStream(userMessage, selectedModel)) {
            controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`))
          }
          controller.close()
        }
        catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'SERVER_ERROR'
          controller.enqueue(encoder.encode(`${JSON.stringify({ type: 'error', error: errorMessage })}\n`))
          controller.close()
        }
      },
    })

    return new Response(stream, {
      status: 200,
      headers: {
        'Content-Type': 'application/x-ndjson; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    })
  }
  catch (error) {
    return createServerErrorResponse(error)
  }
}
