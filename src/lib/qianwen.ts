import type {
  GenerateLLMProviderParams,
  LLMMessage,
  LLMProvider,
  LLMStreamEvent,
  LLMToolCall,
  LLMToolDefinition,
  LLMUsage,
} from '@/src/lib/llm/types'

export interface GenerateQianwenEmbeddingResult {
  vector: number[]
  latency: number
}

interface QianwenStreamChunk {
  choices?: Array<{
    delta?: {
      content?: string
      tool_calls?: Array<{
        index: number
        id?: string
        type?: 'function'
        function?: {
          name?: string
          arguments?: string
        }
      }>
    }
    finish_reason?: 'stop' | 'length' | 'tool_calls' | 'content_filter' | 'function_call' | null
  }>
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
  }
}

interface QianwenCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string | null
      tool_calls?: LLMToolCall[]
    }
  }>
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
  }
}

const QWEN_API_URL = process.env.QWEN_BASE_URL ?? process.env.QIANWEN_BASE_URL ?? 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions'
const QWEN_EMBEDDING_API_URL = process.env.QWEN_EMBEDDING_BASE_URL ?? process.env.QIANWEN_EMBEDDING_BASE_URL ?? 'https://dashscope.aliyuncs.com/compatible-mode/v1/embeddings'
const QWEN_EMBEDDING_MODEL = process.env.QWEN_EMBEDDING_MODEL ?? process.env.QIANWEN_EMBEDDING_MODEL ?? 'text-embedding-v4'

const EMPTY_USAGE: LLMUsage = {
  prompt: 0,
  completion: 0,
  total: 0,
}

function createEmptyToolCall(index: number): LLMToolCall {
  return {
    id: `stream-tool-call-${index}`,
    type: 'function',
    function: {
      name: '',
      arguments: '',
    },
  }
}

function createMockEmbedding(text: string) {
  const seed = Array.from(text).reduce((total, char, index) => total + char.charCodeAt(0) * (index + 1), 0)

  return Array.from({ length: 16 }, (_, index) => {
    const value = Math.sin(seed + index * 17) * 0.5 + Math.cos(seed / (index + 1 || 1)) * 0.5
    return Number(value.toFixed(6))
  })
}

function normalizeQianwenUsage(
  payloadUsage?: QianwenStreamChunk['usage'] | QianwenCompletionResponse['usage'],
): LLMUsage | null {
  if (!payloadUsage) {
    return null
  }

  const prompt = payloadUsage.prompt_tokens ?? 0
  const completion = payloadUsage.completion_tokens ?? 0
  const total = payloadUsage.total_tokens ?? prompt + completion

  return {
    prompt,
    completion,
    total,
  }
}

function buildMockToolSummary(message: LLMMessage) {
  let parsedContent: unknown = null

  try {
    parsedContent = message.content ? JSON.parse(message.content) as unknown : null
  }
  catch {
    parsedContent = null
  }

  if (message.name === 'calculate_expression' && parsedContent && typeof parsedContent === 'object') {
    const payload = parsedContent as { expression?: string, result?: number }
    if (payload.expression && typeof payload.result === 'number') {
      return `${payload.expression} 的计算结果是 ${payload.result}。`
    }
  }

  if (message.name === 'get_time' && parsedContent && typeof parsedContent === 'object') {
    const payload = parsedContent as { formatted?: string, timezone?: string }
    if (payload.formatted && payload.timezone) {
      return `当前时间是 ${payload.formatted}（时区：${payload.timezone}）。`
    }
  }

  if (message.name === 'get_weather' && parsedContent && typeof parsedContent === 'object') {
    const payload = parsedContent as {
      location?: string
      temperature?: number
      description?: string
      windSpeed?: number
    }
    if (payload.location && typeof payload.temperature === 'number') {
      const windText = typeof payload.windSpeed === 'number' ? `，风速 ${payload.windSpeed} km/h` : ''
      return `${payload.location}当前天气${payload.description ? `为${payload.description}` : ''}，气温 ${payload.temperature}°C${windText}。`
    }
  }

  if (typeof message.content === 'string' && message.content.trim()) {
    return `工具返回结果：${message.content}`
  }

  return '工具已执行完成。'
}

function inferMockToolCall(messages: LLMMessage[], tools?: LLMToolDefinition[]) {
  const toolNames = new Set((tools ?? []).map(item => item.function.name))
  const lastUserMessage = [...messages].reverse().find(item => item.role === 'user')?.content?.trim() ?? ''

  if (!lastUserMessage) {
    return null
  }

  if (toolNames.has('get_weather') && /天气|气温|温度|下雨|降雨|风力|weather/i.test(lastUserMessage)) {
    const matchedLocation = lastUserMessage.match(/([\u4E00-\u9FFF]{2,20})现在?的?天气/)
    const location = matchedLocation?.[1]?.trim() || lastUserMessage.trim()

    return {
      id: 'mock-tool-call-weather',
      type: 'function' as const,
      function: {
        name: 'get_weather',
        arguments: JSON.stringify({ location }),
      },
    }
  }

  if (toolNames.has('get_time') && /几点|时间|日期|星期|time|date/i.test(lastUserMessage)) {
    return {
      id: 'mock-tool-call-time',
      type: 'function' as const,
      function: {
        name: 'get_time',
        arguments: JSON.stringify({ timezone: 'Asia/Shanghai', locale: 'zh-CN' }),
      },
    }
  }

  if (toolNames.has('calculate_expression')) {
    const normalizedMessage = lastUserMessage.replace(/[=＝]\s*\?*$/, '').trim()
    const expressionMatch = normalizedMessage.match(/([0-9+\-*/().%\s×÷]{3,})/)

    if (/计算|等于多少|是多少|[+\-*/×÷]/.test(lastUserMessage) && expressionMatch?.[1]) {
      return {
        id: 'mock-tool-call-calc',
        type: 'function' as const,
        function: {
          name: 'calculate_expression',
          arguments: JSON.stringify({ expression: expressionMatch[1].trim() }),
        },
      }
    }
  }

  return null
}

function createMockQwenCompletion({
  messages,
  tools,
}: GenerateLLMProviderParams) {
  const lastToolMessage = [...messages].reverse().find(item => item.role === 'tool')

  if (lastToolMessage) {
    return {
      content: buildMockToolSummary(lastToolMessage),
      toolCalls: [],
      usage: EMPTY_USAGE,
      latency: 0,
      provider: 'qwen' as const,
    }
  }

  const inferredToolCall = inferMockToolCall(messages, tools)
  if (inferredToolCall) {
    return {
      content: '',
      toolCalls: [inferredToolCall],
      usage: EMPTY_USAGE,
      latency: 0,
      provider: 'qwen' as const,
    }
  }

  const lastUserMessage = [...messages].reverse().find(item => item.role === 'user')?.content ?? ''

  return {
    content: `Mock Qianwen Reply: ${lastUserMessage}`,
    toolCalls: [],
    usage: EMPTY_USAGE,
    latency: 0,
    provider: 'qwen' as const,
  }
}

export const qwenProvider: LLMProvider = {
  async generate({
    providerModel,
    messages,
    tools,
    temperature = 0.2,
  }) {
    const apiKey = process.env.QWEN_API_KEY ?? process.env.QIANWEN_API_KEY

    if (!apiKey) {
      return createMockQwenCompletion({ providerModel, messages, tools, temperature })
    }

    const startedAt = performance.now()
    const response = await fetch(QWEN_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: providerModel,
        messages,
        tools,
        tool_choice: tools?.length ? 'auto' : undefined,
        temperature,
        stream: false,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`QIANWEN_ERROR: ${response.status} ${errorText}`)
    }

    const payload = (await response.json()) as QianwenCompletionResponse
    const message = payload.choices?.[0]?.message
    const usage = normalizeQianwenUsage(payload.usage) ?? EMPTY_USAGE

    return {
      content: message?.content ?? '',
      toolCalls: message?.tool_calls ?? [],
      usage,
      latency: performance.now() - startedAt,
      provider: 'qwen' as const,
    }
  },

  async *generateStream({
    providerModel,
    messages,
    tools,
    temperature = 0.2,
  }): AsyncGenerator<LLMStreamEvent> {
    const apiKey = process.env.QWEN_API_KEY ?? process.env.QIANWEN_API_KEY

    if (!apiKey) {
      const mockCompletion = createMockQwenCompletion({ providerModel, messages, tools, temperature })

      if (mockCompletion.toolCalls.length === 0) {
        for (const char of mockCompletion.content) {
          yield { type: 'text', content: char }
        }
      }

      yield {
        type: 'done',
        result: mockCompletion,
      }
      return
    }

    const startedAt = performance.now()
    const response = await fetch(QWEN_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: providerModel,
        messages,
        tools,
        tool_choice: tools?.length ? 'auto' : undefined,
        temperature,
        stream: true,
        stream_options: {
          include_usage: true,
        },
      }),
    })

    if (!response.ok || !response.body) {
      const errorText = await response.text()
      throw new Error(`QIANWEN_ERROR: ${response.status} ${errorText}`)
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let content = ''
    const usage = { ...EMPTY_USAGE }
    const toolCalls: LLMToolCall[] = []

    function *handlePayload(payload: string): Generator<LLMStreamEvent> {
      if (!payload || payload === '[DONE]') {
        return
      }

      const chunk = JSON.parse(payload) as QianwenStreamChunk
      const chunkUsage = normalizeQianwenUsage(chunk.usage)

      if (chunkUsage) {
        usage.prompt = chunkUsage.prompt
        usage.completion = chunkUsage.completion
        usage.total = chunkUsage.total
      }

      for (const choice of chunk.choices ?? []) {
        const delta = choice.delta
        const deltaContent = delta?.content ?? ''

        if (deltaContent) {
          content += deltaContent
          yield { type: 'text', content: deltaContent }
        }

        for (const partialToolCall of delta?.tool_calls ?? []) {
          const targetIndex = partialToolCall.index
          const existingToolCall = toolCalls[targetIndex] ?? createEmptyToolCall(targetIndex)

          if (partialToolCall.id) {
            existingToolCall.id = partialToolCall.id
          }

          if (partialToolCall.type) {
            existingToolCall.type = partialToolCall.type
          }

          if (partialToolCall.function?.name) {
            existingToolCall.function.name += partialToolCall.function.name
          }

          if (partialToolCall.function?.arguments) {
            existingToolCall.function.arguments += partialToolCall.function.arguments
          }

          toolCalls[targetIndex] = existingToolCall
        }
      }
    }

    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        buffer += decoder.decode()
        break
      }

      buffer += decoder.decode(value, { stream: true })
      const frames = buffer.split('\n\n')
      buffer = frames.pop() ?? ''

      for (const frame of frames) {
        const dataLines = frame
          .split('\n')
          .map(line => line.trim())
          .filter(line => line.startsWith('data:'))
          .map(line => line.slice(5).trim())

        for (const dataLine of dataLines) {
          yield * handlePayload(dataLine)
        }
      }
    }

    const trailingFrames = buffer
      .split('\n\n')
      .map(frame => frame.trim())
      .filter(Boolean)

    for (const frame of trailingFrames) {
      const dataLines = frame
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.startsWith('data:'))
        .map(line => line.slice(5).trim())

      for (const dataLine of dataLines) {
        yield * handlePayload(dataLine)
      }
    }

    yield {
      type: 'done',
      result: {
        content,
        toolCalls: toolCalls.filter(toolCall => toolCall.function.name),
        usage,
        latency: performance.now() - startedAt,
        provider: 'qwen',
      },
    }
  },
}

export async function generateQianwenEmbedding(text: string): Promise<GenerateQianwenEmbeddingResult> {
  const apiKey = process.env.QWEN_API_KEY ?? process.env.QIANWEN_API_KEY

  if (!apiKey) {
    return {
      vector: createMockEmbedding(text),
      latency: 0,
    }
  }

  const startedAt = performance.now()
  const response = await fetch(QWEN_EMBEDDING_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: QWEN_EMBEDDING_MODEL,
      input: text,
      encoding_format: 'float',
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`QIANWEN_EMBEDDING_ERROR: ${response.status} ${errorText}`)
  }

  const payload = await response.json() as {
    data?: Array<{
      embedding?: number[]
    }>
  }

  const vector = payload.data?.[0]?.embedding

  if (!Array.isArray(vector) || vector.some(value => typeof value !== 'number')) {
    throw new Error('QIANWEN_EMBEDDING_ERROR: invalid embedding response')
  }

  return {
    vector,
    latency: performance.now() - startedAt,
  }
}
