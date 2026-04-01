import type { ChatEvaluation } from '@/src/lib/chat-workflow'
import { z } from 'zod'
import { llm } from '@/src/lib/llm'
import { buildPrompt } from '@/src/lib/prompt-builder'
import { EMPTY_USAGE } from './constants'

const ChatEvaluationSchema = z.object({
  success: z.boolean(),
  reason: z.string().trim().min(1),
  nextAction: z.string().trim().default(''),
})

interface EvaluateChatResultParams {
  model: string
  userGoal: string
  currentResult: string
}

function extractJsonObject(content: string) {
  const normalized = content
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/, '')
    .replace(/\s*```$/, '')

  if (normalized.startsWith('{') && normalized.endsWith('}')) {
    return normalized
  }

  const firstBraceIndex = normalized.indexOf('{')
  const lastBraceIndex = normalized.lastIndexOf('}')

  if (firstBraceIndex >= 0 && lastBraceIndex > firstBraceIndex) {
    return normalized.slice(firstBraceIndex, lastBraceIndex + 1)
  }

  return normalized
}

function parseChatEvaluation(content: string): ChatEvaluation {
  return ChatEvaluationSchema.parse(JSON.parse(extractJsonObject(content)))
}

function buildFallbackEvaluation(currentResult: string): ChatEvaluation {
  if (!currentResult.trim()) {
    return {
      success: false,
      reason: '当前结果为空，无法判定任务完成。',
      nextAction: '重新规划任务，并生成一个直接回应用户目标的完整回答。',
    }
  }

  return {
    success: true,
    reason: 'Evaluator 不可用，按降级策略保留当前结果。',
    nextAction: '',
  }
}

export async function evaluateChatResult(params: EvaluateChatResultParams) {
  try {
    const completion = await llm.generate({
      model: params.model,
      messages: buildPrompt({
        role: 'evaluator',
        userGoal: params.userGoal,
        currentResult: params.currentResult || '(empty)',
      }),
      temperature: 0.1,
    })

    return {
      evaluation: parseChatEvaluation(completion.content),
      usage: completion.usage,
    }
  }
  catch (error) {
    console.error('Failed to evaluate chat result, using fallback evaluation:', error)
    return {
      evaluation: buildFallbackEvaluation(params.currentResult),
      usage: EMPTY_USAGE,
    }
  }
}
