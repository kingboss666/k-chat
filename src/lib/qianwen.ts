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

export interface GenerateQianwenTextParams {
  messages: QianwenMessage[]
}

export interface GenerateQianwenChatCompletionParams {
  messages: QianwenMessage[]
  tools?: QianwenToolDefinition[]
  temperature?: number
}

export interface GenerateQianwenTextResult {
  content: string
  usage: {
    prompt: number
    completion: number
    total: number
  }
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

const QIANWEN_API_URL = process.env.QIANWEN_BASE_URL
  ?? 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions'
const QIANWEN_MODEL = process.env.QIANWEN_MODEL ?? 'qwen-plus'

export type QianwenStreamEvent
  = | { type: 'text', content: string }
    | { type: 'usage', usage: QianwenUsage }

const EMPTY_USAGE: QianwenUsage = {
  prompt: 0,
  completion: 0,
  total: 0,
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

export async function* generateQianwenTextStream({ messages }: GenerateQianwenTextParams): AsyncGenerator<QianwenStreamEvent> {
  const apiKey = process.env.QIANWEN_API_KEY

  // 本地 mock 也按字符流式产出，确保前端流式链路可验证
  if (!apiKey) {
    const lastUserMessage = [...messages].reverse().find(item => item.role === 'user')?.content ?? ''
    const mockContent = `Mock Qianwen Reply: ${lastUserMessage}`
    for (const char of mockContent) {
      yield { type: 'text', content: char }
    }
    yield {
      type: 'usage',
      usage: {
        prompt: 0,
        completion: 0,
        total: 0,
      },
    }
    return
  }

  const qianwenMessages: QianwenMessage[] = messages.map(message => ({
    role: message.role,
    content: message.content,
  }))

  // 流式模式：请求上游返回增量片段
  const response = await fetch(QIANWEN_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: QIANWEN_MODEL,
      messages: qianwenMessages,
      temperature: 0.7,
      stream: true,
      stream_options: {
        include_usage: true,
      },
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`QIANWEN_ERROR: ${response.status} ${errorText}`)
  }

  if (!response.body) {
    throw new Error('QIANWEN_ERROR: empty stream body')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  // buffer 用于拼接跨 chunk 的半行数据
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) {
      buffer += decoder.decode()
      break
    }
    buffer += decoder.decode(value, { stream: true })

    // SSE 以换行分隔事件，保留最后一段未完整行到下轮继续拼接
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const rawLine of lines) {
      const line = rawLine.trim()
      // 只处理 data: 行，跳过空行和其他字段（event/id/retry）
      if (!line || !line.startsWith('data:')) {
        continue
      }

      const data = line.slice(5).trim()
      // SSE 结束标记，立即停止生成器
      if (data === '[DONE]') {
        return
      }

      try {
        const payload = JSON.parse(data) as QianwenStreamChunk

        // 兼容不同返回结构：优先 delta.content，回退到 message.content
        const deltaText
          = payload.choices?.[0]?.delta?.content
            ?? payload.choices?.[0]?.message?.content
            ?? ''
        if (deltaText) {
          yield { type: 'text', content: deltaText }
        }

        const usage = normalizeQianwenUsage(payload.usage)
        if (usage) {
          yield { type: 'usage', usage }
        }
      }
      catch {
        // 某些 data 行可能不是 JSON，忽略后继续处理后续片段
      }
    }
  }

  // 处理循环结束后 buffer 中可能残留的最后一批事件
  const remainingLines = buffer.split('\n')

  for (const rawLine of remainingLines) {
    const line = rawLine.trim()
    if (!line || !line.startsWith('data:')) {
      continue
    }

    const data = line.slice(5).trim()
    if (data === '[DONE]') {
      return
    }

    try {
      const payload = JSON.parse(data) as QianwenStreamChunk
      const deltaText = payload.choices?.[0]?.delta?.content
        ?? payload.choices?.[0]?.message?.content
        ?? ''
      if (deltaText) {
        yield { type: 'text', content: deltaText }
      }

      const usage = normalizeQianwenUsage(payload.usage)
      if (usage) {
        yield { type: 'usage', usage }
      }
    }
    catch {
      // 某些 data 行可能不是 JSON，忽略后继续处理后续片段
    }
  }
}
