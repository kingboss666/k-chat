import type { ChatEvaluation } from '@/src/lib/chat-workflow'
import { z } from 'zod'
import { llm } from '@/src/lib/llm'
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

function buildEvaluatorSystemPrompt() {
  return [
    '你是 Evaluator Agent。',
    '你的职责是独立判断 currentResult 是否已经满足 userGoal。',
    '不要重写答案，不要补做实现，只做判断。',
    '如果 currentResult 已经直接、完整、准确地回应了 userGoal，则 success=true。',
    '如果仍然存在遗漏、偏题、信息不足或表达不清，则 success=false。',
    '当 success=false 时，nextAction 必须给出下一轮 Planner/Executor 可以直接执行的修正方向。',
    '当 success=true 时，nextAction 保持空字符串即可。',
    '必须输出 JSON，不允许额外解释。',
    '输出 schema:',
    '{"success":true,"reason":"简短说明","nextAction":""}',
  ].join('\n')
}

function buildEvaluatorUserPrompt({ userGoal, currentResult }: EvaluateChatResultParams) {
  return [
    `userGoal:\n${userGoal}`,
    `currentResult:\n${currentResult || '(empty)'}`,
  ].join('\n\n')
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
      messages: [
        {
          role: 'system',
          content: buildEvaluatorSystemPrompt(),
        },
        {
          role: 'user',
          content: buildEvaluatorUserPrompt(params),
        },
      ],
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
