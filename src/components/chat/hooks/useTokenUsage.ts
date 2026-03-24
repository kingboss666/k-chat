import type { ChatStreamUsage, TokenUsageStat } from '../chat-types'
import { useCallback, useRef, useState } from 'react'

function formatDuration(durationMs: number) {
  return `${(durationMs / 1000).toFixed(2)}s`
}

function formatNullableDuration(durationMs: number | null) {
  if (durationMs === null) {
    return '--'
  }
  return formatDuration(durationMs)
}

function formatNullableNumber(value: number | null, digits = 2) {
  if (value === null) {
    return '--'
  }
  return value.toFixed(digits)
}

function estimateTokenCount(text: string) {
  const normalizedText = text.trim()
  if (!normalizedText) {
    return 0
  }

  const cjkCharCount = (normalizedText.match(/[\u3400-\u4DBF\u4E00-\u9FFF]/g) ?? []).length
  const nonCjkCharCount = normalizedText.length - cjkCharCount
  return Math.max(1, cjkCharCount + Math.ceil(nonCjkCharCount / 4))
}

interface AppendTokenUsageParams {
  usage: ChatStreamUsage | null
  requestStartedAt: number | null
  firstTokenAt: number | null
  isAborted: boolean
  fallbackPromptTokens: number
  fallbackCompletionTokens: number
}

function useTokenUsage() {
  const [tokenUsageStats, setTokenUsageStats] = useState<TokenUsageStat[]>([])
  const idCounterRef = useRef(0)

  const appendTokenUsageStat = useCallback((params: AppendTokenUsageParams) => {
    const {
      usage,
      requestStartedAt,
      firstTokenAt,
      isAborted,
      fallbackPromptTokens,
      fallbackCompletionTokens,
    } = params
    if (requestStartedAt === null) {
      return
    }

    const promptTokens = usage?.prompt ?? fallbackPromptTokens
    const completionTokens = usage?.completion ?? fallbackCompletionTokens
    const totalTokens = usage?.total ?? promptTokens + completionTokens
    const completedAt = performance.now()
    const generationDurationMs = completedAt - requestStartedAt
    const firstTokenLatencyMs = firstTokenAt === null ? null : firstTokenAt - requestStartedAt
    const msPerToken = completionTokens > 0 ? generationDurationMs / completionTokens : null
    const tokensPerSecond = completionTokens > 0
      ? completionTokens / (generationDurationMs / 1000)
      : null

    idCounterRef.current += 1

    setTokenUsageStats(previousStats => [
      ...previousStats,
      {
        id: `${Date.now()}-${idCounterRef.current}`,
        prompt: promptTokens,
        completion: completionTokens,
        total: totalTokens,
        firstTokenLatencyMs,
        generationDurationMs,
        msPerToken,
        tokensPerSecond,
        isAborted,
      },
    ])
  }, [])

  return {
    tokenUsageStats,
    appendTokenUsageStat,
    formatDuration,
    formatNullableDuration,
    formatNullableNumber,
    estimateTokenCount,
  }
}

export type { AppendTokenUsageParams }
export { useTokenUsage }
