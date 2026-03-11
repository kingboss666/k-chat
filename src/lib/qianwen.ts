export interface QianwenToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

export interface QianwenToolDefinition {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

export interface QianwenMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  name?: string
  tool_call_id?: string
  tool_calls?: QianwenToolCall[]
}

export interface GenerateQianwenChatCompletionParams {
  messages: QianwenMessage[]
  tools?: QianwenToolDefinition[]
  temperature?: number
}

export interface GenerateQianwenEmbeddingResult {
  vector: number[]
  latency: number
}

export interface QianwenUsage {
  prompt: number
  completion: number
  total: number
}

export interface GenerateQianwenChatCompletionResult {
  content: string
  toolCalls: QianwenToolCall[]
  usage: QianwenUsage
  latency: number
}

interface QianwenStreamChunk {
  choices?: Array<{
    delta?: {
      content?: string
    }
    message?: {
      content?: string
    }
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
      tool_calls?: QianwenToolCall[]
    }
  }>
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
  }
}

const QIANWEN_API_URL = process.env.QIANWEN_BASE_URL ?? 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions'
const QIANWEN_MODEL = process.env.QIANWEN_MODEL ?? 'qwen-plus'
const QIANWEN_EMBEDDING_API_URL = process.env.QIANWEN_EMBEDDING_BASE_URL ?? 'https://dashscope.aliyuncs.com/compatible-mode/v1/embeddings'
const QIANWEN_EMBEDDING_MODEL = process.env.QIANWEN_EMBEDDING_MODEL ?? 'text-embedding-v4'

const EMPTY_USAGE: QianwenUsage = {
  prompt: 0,
  completion: 0,
  total: 0,
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
): QianwenUsage | null {
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

function buildMockToolSummary(message: QianwenMessage) {
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

function inferMockToolCall(messages: QianwenMessage[], tools?: QianwenToolDefinition[]) {
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

function createMockQianwenCompletion({
  messages,
  tools,
}: GenerateQianwenChatCompletionParams): GenerateQianwenChatCompletionResult {
  const lastToolMessage = [...messages].reverse().find(item => item.role === 'tool')

  if (lastToolMessage) {
    return {
      content: buildMockToolSummary(lastToolMessage),
      toolCalls: [],
      usage: EMPTY_USAGE,
      latency: 0,
    }
  }

  const inferredToolCall = inferMockToolCall(messages, tools)
  if (inferredToolCall) {
    return {
      content: '',
      toolCalls: [inferredToolCall],
      usage: EMPTY_USAGE,
      latency: 0,
    }
  }

  const lastUserMessage = [...messages].reverse().find(item => item.role === 'user')?.content ?? ''

  return {
    content: `Mock Qianwen Reply: ${lastUserMessage}`,
    toolCalls: [],
    usage: EMPTY_USAGE,
    latency: 0,
  }
}

export async function generateQianwenChatCompletion({
  messages,
  tools,
  temperature = 0.2,
}: GenerateQianwenChatCompletionParams): Promise<GenerateQianwenChatCompletionResult> {
  const apiKey = process.env.QIANWEN_API_KEY

  if (!apiKey) {
    return createMockQianwenCompletion({ messages, tools, temperature })
  }

  const startedAt = performance.now()
  const response = await fetch(QIANWEN_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: QIANWEN_MODEL,
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
  }
}

export async function generateQianwenEmbedding(text: string): Promise<GenerateQianwenEmbeddingResult> {
  const apiKey = process.env.QIANWEN_API_KEY

  if (!apiKey) {
    return {
      vector: createMockEmbedding(text),
      latency: 0,
    }
  }

  const startedAt = performance.now()
  const response = await fetch(QIANWEN_EMBEDDING_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: QIANWEN_EMBEDDING_MODEL,
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
