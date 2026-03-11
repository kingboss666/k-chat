type ChatRole = 'user' | 'assistant'

interface ChatMessage {
  id: string
  role: ChatRole
  content: string
  reasoning?: string
  isThinking?: boolean
  isReasoningExpanded?: boolean
}

interface ChatApiResponse {
  error?: string
}

interface TokenUsageStat {
  id: string
  prompt: number
  completion: number
  total: number
  firstTokenLatencyMs: number | null
  generationDurationMs: number
  msPerToken: number | null
  tokensPerSecond: number | null
  isAborted: boolean
}

interface ChatStreamUsage {
  prompt: number
  completion: number
  total: number
}

type ChatStreamEvent
  = | { type: 'text', content: string }
    | { type: 'reasoning', content: string }
    | { type: 'usage', usage: ChatStreamUsage }
    | { type: 'error', error: string }

export type {
  ChatApiResponse,
  ChatMessage,
  ChatRole,
  ChatStreamEvent,
  ChatStreamUsage,
  TokenUsageStat,
}
