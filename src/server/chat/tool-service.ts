import type { QianwenToolCall } from '@/src/lib/qianwen'
import { z } from 'zod'

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

// 工具执行器是工作流里的基础设施层，负责把模型工具调用路由到具体实现。
export async function executeToolCall(toolCall: QianwenToolCall) {
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
