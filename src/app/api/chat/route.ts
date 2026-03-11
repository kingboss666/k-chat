import type { QianwenMessage, QianwenToolCall, QianwenToolDefinition } from '@/src/lib/qianwen'
import { z } from 'zod'
import { LongTermMemory } from '@/src/lib/long-term-memory'
import { SummaryMemory } from '@/src/lib/memory'
import { buildRagPrompt } from '@/src/lib/prompt-builder'
import { generateQianwenChatCompletion, generateQianwenEmbedding } from '@/src/lib/qianwen'
import { LocalVectorStore } from '@/src/lib/vector-store'

interface ChatRequestBody {
  message?: string
}

const MAX_TOOL_ROUNDS = 4
const DEFAULT_RAG_TOP_K = 3

const chatMemory = new SummaryMemory(20)
const longTermMemory = new LongTermMemory()
const vectorStore = new LocalVectorStore()

const TimeToolSchema = z.object({
  timezone: z.string().trim().min(1).optional(),
  locale: z.string().trim().min(1).optional(),
})

const CalculationToolSchema = z.object({
  expression: z.string().trim().min(1),
})

const WeatherToolSchema = z.object({
  location: z.string().trim().min(1),
})

const CHAT_TOOLS: QianwenToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'get_weather',
      description: '查询指定城市或地区的当前天气信息，返回温度、体感温度、湿度、风速和天气描述。',
      parameters: {
        type: 'object',
        properties: {
          location: {
            type: 'string',
            description: '用户想查询天气的城市或地区，例如 北京、上海、Tokyo。',
          },
        },
        required: ['location'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_time',
      description: '查询当前时间或日期。若用户指定地区，请优先传入对应 IANA 时区，例如 Asia/Shanghai、America/New_York。',
      parameters: {
        type: 'object',
        properties: {
          timezone: {
            type: 'string',
            description: 'IANA 时区名，例如 Asia/Shanghai。',
          },
          locale: {
            type: 'string',
            description: '日期时间格式化语言环境，例如 zh-CN、en-US。',
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'calculate_expression',
      description: '计算简单数学表达式，例如 23 * (7 + 5) / 2。',
      parameters: {
        type: 'object',
        properties: {
          expression: {
            type: 'string',
            description: '只包含数字、括号、小数点以及 + - * / % 的数学表达式。',
          },
        },
        required: ['expression'],
        additionalProperties: false,
      },
    },
  },
]

const WEATHER_CODE_MAP = new Map<number, string>([
  [0, '晴朗'],
  [1, '大体晴朗'],
  [2, '局部多云'],
  [3, '阴天'],
  [45, '有雾'],
  [48, '冻雾'],
  [51, '小毛毛雨'],
  [53, '毛毛雨'],
  [55, '强毛毛雨'],
  [56, '冻毛毛雨'],
  [57, '强冻毛毛雨'],
  [61, '小雨'],
  [63, '中雨'],
  [65, '大雨'],
  [66, '冻雨'],
  [67, '强冻雨'],
  [71, '小雪'],
  [73, '中雪'],
  [75, '大雪'],
  [77, '雪粒'],
  [80, '阵雨'],
  [81, '较强阵雨'],
  [82, '强阵雨'],
  [85, '阵雪'],
  [86, '强阵雪'],
  [95, '雷暴'],
  [96, '雷暴伴小冰雹'],
  [99, '雷暴伴大冰雹'],
])

function buildSystemPrompt() {
  return [
    '你是一个具备工具调用能力的中文助理。',
    '当用户询问天气、时间/日期、简单计算时，你必须优先调用工具获取结果，禁止凭记忆直接回答或猜测。',
    '天气相关问题必须调用 get_weather。',
    '当前时间、日期、星期、某地现在几点等问题必须调用 get_time。',
    '四则运算、括号表达式、简单数学题必须调用 calculate_expression。',
    '如果工具执行失败或结果不完整，要明确告诉用户，不得编造。',
    '如果用户没有提供足够信息，例如只问“天气怎么样”，可以先简短追问地点。',
    '如果系统提供了知识库上下文，你必须优先基于知识库回答；知识库没有明确提到时，要明确说知识库中没有提供这个信息，不要猜测。',
    '最终回答保持简洁、准确、自然，优先用中文回答。',
    `你必须遵循以下格式回答：
      Thought: 你当前的思考过程
      Action: 工具名称[参数]
      Observation: 等待工具返回结果后填入
      Final Answer: 最终结论。
      上面每一步回答都需要换行。`,
  ].join('\n')
}

async function buildKnowledgeContext(userMessage: string) {
  // chat 每次收到用户问题，都先走一次 query embedding + topK 检索。
  const { vector } = await generateQianwenEmbedding(userMessage)
  const results = await vectorStore.search(vector, DEFAULT_RAG_TOP_K)
  const chunks = results.map(result => ({ text: result.text }))

  return {
    results,
    prompt: buildRagPrompt({
      question: userMessage,
      chunks,
    }),
  }
}

async function* generateStreamResponse(userMessage: string) {
  if (chatMemory.shouldSummarize()) {
    const toSummarize = chatMemory.getMessagesToSummarize()
    const newSummary = await generateSummary(toSummarize)
    chatMemory.setSummary(newSummary)
    chatMemory.clearOldMessages()
  }

  await longTermMemory.load()

  const history = chatMemory.getHistory()
  const summary = chatMemory.getSummary()
  const userContext = longTermMemory.toContextString()
  const knowledgeContext = await buildKnowledgeContext(userMessage)

  console.log('history', history)
  console.log('summary', summary)

  const llmMessages: QianwenMessage[] = [
    { role: 'system', content: buildSystemPrompt() },
  ]

  if (userContext) {
    llmMessages.push({
      role: 'system',
      content: `用户信息：\n${userContext}`,
    })
  }

  if (summary) {
    llmMessages.push({
      role: 'system',
      content: `对话摘要：\n${summary}`,
    })
  }

  // 把知识库上下文作为额外 system prompt 注入现有 chat 流程。
  llmMessages.push({
    role: 'system',
    content: knowledgeContext.prompt,
  })

  llmMessages.push(
    ...history.map(message => ({ role: message.role, content: message.content })),
    { role: 'user', content: userMessage },
  )

  const totalUsage = { prompt: 0, completion: 0, total: 0 }

  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    const completion = await generateQianwenChatCompletion({
      messages: llmMessages,
      tools: CHAT_TOOLS,
      temperature: 0.2,
    })

    totalUsage.prompt += completion.usage.prompt
    totalUsage.completion += completion.usage.completion
    totalUsage.total += completion.usage.total

    if (completion.toolCalls.length === 0) {
      const finalContent = completion.content.trim()

      // 流式输出，每次发送 1-3 个字符
      for (let i = 0; i < finalContent.length; i += 1) {
        const chunk = finalContent[i]
        yield { type: 'text', content: chunk }
        // 添加微小延迟，确保流式效果
        await new Promise(resolve => setTimeout(resolve, 10))
      }

      yield { type: 'usage', usage: totalUsage }

      chatMemory.push({ role: 'user', content: userMessage })
      chatMemory.push({ role: 'assistant', content: finalContent })
      return
    }

    llmMessages.push({
      role: 'assistant',
      content: completion.content || null,
      tool_calls: completion.toolCalls,
    })

    for (const toolCall of completion.toolCalls) {
      const toolResult = await executeToolCall(toolCall)
      llmMessages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        name: toolCall.function.name,
        content: JSON.stringify(toolResult),
      })
    }
  }

  throw new Error('工具调用轮次超出限制，请重试。')
}

function formatNumber(value: number) {
  if (Number.isInteger(value)) {
    return value
  }

  return Number(value.toFixed(6))
}

function tokenizeExpression(expression: string) {
  const sanitizedExpression = expression.replace(/\s+/g, '')
  const tokens = sanitizedExpression.match(/\d*\.?\d+|[()+\-*/%]/g) ?? []

  if (tokens.join('') !== sanitizedExpression) {
    throw new TypeError('表达式包含无法识别的字符。')
  }

  return tokens
}

function evaluateExpression(expression: string) {
  const tokens = tokenizeExpression(expression)
  let currentIndex = 0

  function parsePrimary(): number {
    const currentToken = tokens[currentIndex]
    if (!currentToken) {
      throw new TypeError('表达式不完整。')
    }

    if (currentToken === '(') {
      currentIndex += 1
      const value = parseExpression()
      if (tokens[currentIndex] !== ')') {
        throw new TypeError('括号未正确闭合。')
      }
      currentIndex += 1
      return value
    }

    const parsedNumber = Number(currentToken)
    if (Number.isNaN(parsedNumber)) {
      throw new TypeError('表达式中存在无效数字。')
    }

    currentIndex += 1
    return parsedNumber
  }

  function parseUnary(): number {
    if (tokens[currentIndex] === '+') {
      currentIndex += 1
      return parseUnary()
    }

    if (tokens[currentIndex] === '-') {
      currentIndex += 1
      return -parseUnary()
    }

    return parsePrimary()
  }

  function parseTerm(): number {
    let value = parseUnary()

    while (
      tokens[currentIndex] === '*'
      || tokens[currentIndex] === '/'
      || tokens[currentIndex] === '%'
    ) {
      const operator = tokens[currentIndex]
      currentIndex += 1
      const rightValue = parseUnary()

      if (operator === '*') {
        value *= rightValue
      }
      else if (operator === '/') {
        value /= rightValue
      }
      else {
        value %= rightValue
      }
    }

    return value
  }

  function parseExpression(): number {
    let value = parseTerm()

    while (tokens[currentIndex] === '+' || tokens[currentIndex] === '-') {
      const operator = tokens[currentIndex]
      currentIndex += 1
      const rightValue = parseTerm()
      value = operator === '+' ? value + rightValue : value - rightValue
    }

    return value
  }

  const value = parseExpression()
  if (currentIndex < tokens.length) {
    throw new TypeError('表达式格式不正确。')
  }

  if (!Number.isFinite(value)) {
    throw new TypeError('表达式无法得到有效数值结果。')
  }

  return value
}

async function resolveCurrentTime(rawArguments: string) {
  const { timezone = 'Asia/Shanghai', locale = 'zh-CN' } = TimeToolSchema.parse(JSON.parse(rawArguments))
  const now = new Date()

  const formatter = new Intl.DateTimeFormat(locale, {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })

  return {
    timezone,
    locale,
    iso: now.toISOString(),
    formatted: formatter.format(now),
  }
}

async function resolveCalculation(rawArguments: string) {
  const { expression } = CalculationToolSchema.parse(JSON.parse(rawArguments))
  const normalizedExpression = expression.replace(/×/g, '*').replace(/÷/g, '/').trim()

  if (!/^[\d+\-*/().%\s]+$/.test(normalizedExpression)) {
    throw new TypeError('只支持数字、空格、括号以及 + - * / % 运算符。')
  }

  return {
    expression: normalizedExpression,
    result: formatNumber(evaluateExpression(normalizedExpression)),
  }
}

async function resolveWeather(rawArguments: string) {
  const { location } = WeatherToolSchema.parse(JSON.parse(rawArguments))
  const geocodeUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1&language=zh&format=json`
  const geocodeResponse = await fetch(geocodeUrl, {
    headers: {
      Accept: 'application/json',
    },
    cache: 'no-store',
  })

  if (!geocodeResponse.ok) {
    throw new Error(`天气地理编码失败：${geocodeResponse.status}`)
  }

  const geocodePayload = await geocodeResponse.json() as {
    results?: Array<{
      name?: string
      country?: string
      admin1?: string
      latitude?: number
      longitude?: number
      timezone?: string
    }>
  }

  const matchedLocation = geocodePayload.results?.[0]
  if (
    !matchedLocation
    || typeof matchedLocation.latitude !== 'number'
    || typeof matchedLocation.longitude !== 'number'
  ) {
    throw new Error(`未找到 ${location} 的天气位置，请补充更具体的城市或地区。`)
  }

  const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${matchedLocation.latitude}&longitude=${matchedLocation.longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m&timezone=auto&forecast_days=1`
  const weatherResponse = await fetch(weatherUrl, {
    headers: {
      Accept: 'application/json',
    },
    cache: 'no-store',
  })

  if (!weatherResponse.ok) {
    throw new Error(`天气查询失败：${weatherResponse.status}`)
  }

  const weatherPayload = await weatherResponse.json() as {
    current?: {
      time?: string
      temperature_2m?: number
      relative_humidity_2m?: number
      apparent_temperature?: number
      weather_code?: number
      wind_speed_10m?: number
    }
  }

  const currentWeather = weatherPayload.current
  if (!currentWeather || typeof currentWeather.temperature_2m !== 'number') {
    throw new Error('天气服务未返回有效的当前天气数据。')
  }

  const locationLabel = [
    matchedLocation.country,
    matchedLocation.admin1,
    matchedLocation.name,
  ].filter(Boolean).join(' ')

  return {
    query: location,
    location: locationLabel || matchedLocation.name || location,
    timezone: matchedLocation.timezone ?? 'auto',
    observedAt: currentWeather.time ?? '',
    temperature: currentWeather.temperature_2m,
    apparentTemperature: currentWeather.apparent_temperature ?? null,
    humidity: currentWeather.relative_humidity_2m ?? null,
    windSpeed: currentWeather.wind_speed_10m ?? null,
    weatherCode: currentWeather.weather_code ?? null,
    description: WEATHER_CODE_MAP.get(currentWeather.weather_code ?? -1) ?? '未知天气',
  }
}

async function executeToolCall(toolCall: QianwenToolCall) {
  try {
    if (toolCall.function.name === 'get_weather') {
      return await resolveWeather(toolCall.function.arguments)
    }

    if (toolCall.function.name === 'get_time') {
      return await resolveCurrentTime(toolCall.function.arguments)
    }

    if (toolCall.function.name === 'calculate_expression') {
      return await resolveCalculation(toolCall.function.arguments)
    }

    throw new Error(`不支持的工具：${toolCall.function.name}`)
  }
  catch (error) {
    return {
      error: error instanceof Error ? error.message : 'TOOL_EXECUTION_FAILED',
    }
  }
}

async function generateSummary(messages: Array<{ role: 'user' | 'assistant', content: string }>): Promise<string> {
  const conversationText = messages
    .map(msg => `${msg.role}: ${msg.content}`)
    .join('\n')

  const summaryPrompt = `请总结以下对话的关键信息，包括用户背景、讨论主题、重要结论等。保持简洁，不超过200字。

对话内容：
${conversationText}

总结：`

  const completion = await generateQianwenChatCompletion({
    messages: [{ role: 'user', content: summaryPrompt }],
    temperature: 0.3,
  })

  return completion.content.trim()
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as ChatRequestBody
    const userMessage = body.message?.trim() ?? ''

    if (userMessage.length === 0) {
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

    const encoder = new TextEncoder()

    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const event of generateStreamResponse(userMessage)) {
            const line = `${JSON.stringify(event)}\n`
            controller.enqueue(encoder.encode(line))
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
      },
    })
  }

  catch (error: unknown) {
    return new Response(
      JSON.stringify({
        error:
          error instanceof Error
            ? error.message
            : 'SERVER_ERROR',
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
