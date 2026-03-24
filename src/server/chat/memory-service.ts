import type { LongTermMemory, UserProfile } from '@/src/lib/long-term-memory'
import { generateQianwenChatCompletion } from '@/src/lib/qianwen'

interface LongTermMemoryUpdate {
  name?: string
  profession?: string
  interests?: string[]
  preferences?: Record<string, string>
  facts?: string[]
}

function buildLongTermMemoryPrompt(userMessage: string, assistantMessage: string, currentProfile: string) {
  return [
    '请从下面对话中提取适合写入长期记忆的稳定用户信息。',
    '只记录跨会话仍然有价值的信息，例如用户身份、职业、长期兴趣、稳定偏好、背景事实。',
    '不要记录临时问题、一次性任务、当前时间、天气、短期计划。',
    '返回 JSON，对象字段只能是 name、profession、interests、preferences、facts。',
    'name 和 profession 用字符串；interests 和 facts 用字符串数组；preferences 用 key-value 对象。',
    '如果没有新增信息，返回空对象 {}。',
    '不要输出 Markdown 代码块，不要额外解释。',
    '',
    `当前长期记忆：${currentProfile}`,
    `用户消息：${userMessage}`,
    `助手回复：${assistantMessage}`,
  ].join('\n')
}

function parseJsonObject<T>(content: string): T | null {
  const normalized = content
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/, '')
    .replace(/\s*```$/, '')

  try {
    return JSON.parse(normalized) as T
  }
  catch {
    return null
  }
}

function normalizeLongTermMemoryUpdate(payload: unknown): LongTermMemoryUpdate {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return {}
  }

  const candidate = payload as Record<string, unknown>

  return {
    name: typeof candidate.name === 'string' ? candidate.name.trim() : undefined,
    profession: typeof candidate.profession === 'string' ? candidate.profession.trim() : undefined,
    interests: Array.isArray(candidate.interests)
      ? candidate.interests.filter(item => typeof item === 'string').map(item => item.trim()).filter(Boolean)
      : undefined,
    preferences: candidate.preferences && typeof candidate.preferences === 'object' && !Array.isArray(candidate.preferences)
      ? Object.fromEntries(
          Object.entries(candidate.preferences as Record<string, unknown>)
            .filter(([key, value]) => key.trim().length > 0 && typeof value === 'string' && value.trim().length > 0)
            .map(([key, value]) => [key.trim(), (value as string).trim()]),
        )
      : undefined,
    facts: Array.isArray(candidate.facts)
      ? candidate.facts.filter(item => typeof item === 'string').map(item => item.trim()).filter(Boolean)
      : undefined,
  }
}

function mergeLongTermMemoryUpdates(base: LongTermMemoryUpdate, incoming: LongTermMemoryUpdate): LongTermMemoryUpdate {
  return {
    ...base,
    ...incoming,
    interests: [...(base.interests ?? []), ...(incoming.interests ?? [])],
    facts: [...(base.facts ?? []), ...(incoming.facts ?? [])],
    preferences: {
      ...(base.preferences ?? {}),
      ...(incoming.preferences ?? {}),
    },
  }
}

function hasLongTermMemoryUpdate(update: LongTermMemoryUpdate): boolean {
  return Boolean(
    update.name
    || update.profession
    || (update.interests && update.interests.length > 0)
    || (update.preferences && Object.keys(update.preferences).length > 0)
    || (update.facts && update.facts.length > 0),
  )
}

function extractLongTermMemoryByRules(userMessage: string): LongTermMemoryUpdate {
  const update: LongTermMemoryUpdate = {}

  const namePatterns = [
    /我叫\s*([\p{Script=Han}A-Z][\p{Script=Han}\w-]{0,30})/iu,
    /名字是\s*([\p{Script=Han}A-Z][\p{Script=Han}\w-]{0,30})/iu,
  ]

  for (const pattern of namePatterns) {
    const match = userMessage.match(pattern)
    if (match) {
      update.name = match[1]
      break
    }
  }

  const professionMatch = userMessage.match(/我是(?:一名|个)?(.{1,24}?(?:前端工程师|后端工程师|开发工程师|程序员|设计师|产品经理|学生|老师|研究员|运营))/)
  if (professionMatch) {
    update.profession = professionMatch[1].trim()
    update.facts = [...(update.facts ?? []), `用户是${professionMatch[1].trim()}`]
  }

  const interestPatterns = [
    /我喜欢(.+?)(?:[。！；，,]|$)/,
    /我对(.+?)感兴趣(?:[。！；，,]|$)/,
    /我平时关注(.+?)(?:[。！；，,]|$)/,
  ]

  for (const pattern of interestPatterns) {
    const match = userMessage.match(pattern)
    if (!match) {
      continue
    }

    update.interests = match[1]
      .split(/[、,，/和]/)
      .map(item => item.trim())
      .filter(Boolean)

    break
  }

  const preferencePatterns: Array<[RegExp, string]> = [
    [/(?:我更喜欢|我偏好)\s*(React|Vue|Angular|Svelte|Next\.js|Nuxt|TypeScript)/i, 'favorite_framework'],
    [/(?:请用|回答用)\s*(中文|英文)/, 'preferred_language'],
  ]

  for (const [pattern, key] of preferencePatterns) {
    const match = userMessage.match(pattern)
    if (!match) {
      continue
    }

    update.preferences = {
      ...(update.preferences ?? {}),
      [key]: match[1],
    }
  }

  const stableFactPatterns = [
    /我在(.{1,20}?)(?:工作|上班)/,
    /我主要做(.+?)(?:[。！；，,]|$)/,
  ]

  for (const pattern of stableFactPatterns) {
    const match = userMessage.match(pattern)
    if (!match) {
      continue
    }

    update.facts = [...(update.facts ?? []), match[0].trim()]
  }

  return update
}

// 长期记忆写入属于 side effect，集中在单独 service 中，避免 workflow 主流程被细节淹没。
export async function persistLongTermMemory(
  longTermMemory: LongTermMemory,
  userMessage: string,
  assistantMessage: string,
) {
  const currentProfile = longTermMemory.getProfile()
  let update = extractLongTermMemoryByRules(userMessage)

  try {
    const completion = await generateQianwenChatCompletion({
      messages: [{
        role: 'user',
        content: buildLongTermMemoryPrompt(userMessage, assistantMessage, JSON.stringify(currentProfile)),
      }],
      temperature: 0,
    })

    const modelUpdate = normalizeLongTermMemoryUpdate(parseJsonObject<LongTermMemoryUpdate>(completion.content))
    if (hasLongTermMemoryUpdate(modelUpdate)) {
      update = mergeLongTermMemoryUpdates(update, modelUpdate)
    }
  }
  catch (error) {
    console.error('Failed to extract long-term memory:', error)
  }

  if (!hasLongTermMemoryUpdate(update)) {
    return
  }

  longTermMemory.update(update as Partial<UserProfile>)
  await longTermMemory.save()
}
