import type { ChatWorkflowContext } from '@/src/lib/chat-workflow'
import { randomUUID } from 'node:crypto'
import { DEFAULT_CHAT_MODEL, llm } from '@/src/lib/llm'
import { LongTermMemory } from '@/src/lib/long-term-memory'
import { SummaryMemory } from '@/src/lib/memory'
import { EMPTY_USAGE, MAX_CHAT_ITERATIONS } from './constants'
import { evaluateChatResult } from './evaluator-service'
import { executeChatPlan, mergeUsage } from './executor-service'
import {
  appendChatIterationLog,
  buildIterationResultLog,
  cloneUsage,
  subtractUsage,
} from './iteration-log-service'
import { persistLongTermMemory } from './memory-service'
import { planChatTasks } from './planner-service'

const chatMemory = new SummaryMemory(6)
const longTermMemory = new LongTermMemory()

async function generateSummary(
  messages: Array<{ role: 'user' | 'assistant', content: string }>,
  model: string,
) {
  const conversationText = messages
    .map(msg => `${msg.role}: ${msg.content}`)
    .join('\n')

  const summaryPrompt = `请总结以下对话的关键信息，包括用户背景、讨论主题、重要结论等。保持简洁，不超过200字。

对话内容：
${conversationText}

总结：`

  const completion = await llm.generate({
    model,
    messages: [{ role: 'user', content: summaryPrompt }],
    temperature: 0.3,
  })

  return completion.content.trim()
}

function resolveFinalContent(context: ChatWorkflowContext) {
  const finalTask = context.plannedTasks.at(-1)
  const finalTaskValue = finalTask ? context.taskResults[finalTask.id]?.value : ''
  const finalContent = context.finalAnswer
    || (typeof finalTaskValue === 'string' ? finalTaskValue.trim() : '')

  return finalContent || '抱歉，我暂时没能生成有效回答。'
}

function splitTextIntoChunks(content: string, chunkSize = 96) {
  const chunks: string[] = []

  for (let index = 0; index < content.length; index += chunkSize) {
    chunks.push(content.slice(index, index + chunkSize))
  }

  return chunks
}

// 编排层只关心“这次请求怎样被处理”，不关心 HTTP 细节。
export async function* generateChatStream(userMessage: string, model = DEFAULT_CHAT_MODEL) {
  const requestId = randomUUID()

  if (chatMemory.shouldSummarize()) {
    yield { type: 'reasoning', content: '执行步骤：更新历史摘要' }
    const toSummarize = chatMemory.getMessagesToSummarize()
    const newSummary = await generateSummary(toSummarize, model)
    chatMemory.setSummary(newSummary)
    chatMemory.clearOldMessages()
  }

  await longTermMemory.load()
  let context: ChatWorkflowContext = {
    model,
    userMessage,
    history: chatMemory.getHistory(),
    conversationSummary: chatMemory.getSummary(),
    userContext: longTermMemory.toContextString(),
    iteration: 0,
    maxIterations: MAX_CHAT_ITERATIONS,
    lastResult: '',
    feedback: '',
    plannedTasks: [],
    taskResults: {},
    knowledgeResults: [],
    knowledgePrompt: '',
    finalAnswer: '',
    evaluations: [],
    usage: EMPTY_USAGE,
  }

  let finalContent = ''

  while (context.iteration < context.maxIterations) {
    const nextIteration = context.iteration + 1
    const iterationStartedAt = performance.now()
    const iterationUsageBaseline = cloneUsage(context.usage)
    let planningLatencyMs = 0
    let executionLatencyMs = 0
    let evaluationLatencyMs = 0
    let planningUsage = cloneUsage(EMPTY_USAGE)
    let executionUsage = cloneUsage(EMPTY_USAGE)
    let evaluationUsage = cloneUsage(EMPTY_USAGE)

    context = {
      ...context,
      iteration: nextIteration,
      plannedTasks: [],
      taskResults: {},
      knowledgeResults: [],
      knowledgePrompt: '',
      finalAnswer: '',
    }

    yield {
      type: 'reasoning',
      content: `执行轮次：${context.iteration}/${context.maxIterations}`,
    }
    yield { type: 'reasoning', content: '执行步骤：Planner' }

    const planningStartedAt = performance.now()
    const planningResult = await planChatTasks(context)
    planningLatencyMs = performance.now() - planningStartedAt
    planningUsage = cloneUsage(planningResult.usage)
    context = {
      ...context,
      plannedTasks: planningResult.tasks,
      usage: mergeUsage(context.usage, planningUsage),
    }

    yield {
      type: 'reasoning',
      content: `Planner 已生成 ${context.plannedTasks.length} 个步骤：${context.plannedTasks.map(task => task.id).join(' -> ')}`,
    }

    const executionStartedAt = performance.now()
    const executionUsageBaseline = cloneUsage(context.usage)
    const executionStream = executeChatPlan(context, { streamFinalAnswer: false })
    const iterator = executionStream[Symbol.asyncIterator]()
    let executedContext: ChatWorkflowContext | undefined

    while (true) {
      const executionIteration = await iterator.next()

      if (executionIteration.done) {
        executedContext = executionIteration.value
        break
      }

      yield executionIteration.value
    }
    executionLatencyMs = performance.now() - executionStartedAt

    const resolvedContext = executedContext ?? context
    executionUsage = subtractUsage(resolvedContext.usage, executionUsageBaseline)
    finalContent = resolveFinalContent(resolvedContext)
    context = {
      ...resolvedContext,
      finalAnswer: finalContent,
    }

    yield {
      type: 'reasoning',
      content: `执行步骤：Evaluator（第 ${context.iteration} 轮）`,
    }

    const evaluationStartedAt = performance.now()
    const evaluationResult = await evaluateChatResult({
      model: context.model,
      userGoal: userMessage,
      currentResult: finalContent,
    })
    evaluationLatencyMs = performance.now() - evaluationStartedAt
    evaluationUsage = cloneUsage(evaluationResult.usage)
    const evaluation = evaluationResult.evaluation

    context = {
      ...context,
      evaluations: [...context.evaluations, evaluation],
      usage: mergeUsage(context.usage, evaluationUsage),
    }

    await appendChatIterationLog({
      requestId,
      timestamp: new Date().toISOString(),
      userGoal: userMessage,
      iteration: context.iteration,
      plan: context.plannedTasks,
      result: buildIterationResultLog(finalContent, context.taskResults),
      evaluation,
      latency: {
        planningMs: planningLatencyMs,
        executionMs: executionLatencyMs,
        evaluationMs: evaluationLatencyMs,
        totalMs: performance.now() - iterationStartedAt,
      },
      usage: {
        planning: planningUsage,
        execution: executionUsage,
        evaluation: evaluationUsage,
        total: subtractUsage(context.usage, iterationUsageBaseline),
      },
    })

    if (evaluation.success) {
      yield {
        type: 'reasoning',
        content: `Evaluator 通过：${evaluation.reason}`,
      }

      for (const chunk of splitTextIntoChunks(finalContent)) {
        yield { type: 'text', content: chunk }
      }
      break
    }

    if (context.iteration >= context.maxIterations) {
      yield {
        type: 'reasoning',
        content: `Evaluator 未通过，已达到最大迭代次数：${evaluation.reason}`,
      }

      for (const chunk of splitTextIntoChunks(finalContent)) {
        yield { type: 'text', content: chunk }
      }
      break
    }

    yield {
      type: 'reasoning',
      content: `Evaluator 未通过：${evaluation.reason}`,
    }

    if (evaluation.nextAction.trim()) {
      yield {
        type: 'reasoning',
        content: `下一轮修正方向：${evaluation.nextAction}`,
      }
    }

    context = {
      ...context,
      lastResult: finalContent,
      feedback: [
        `失败原因：${evaluation.reason}`,
        evaluation.nextAction.trim() ? `修正建议：${evaluation.nextAction.trim()}` : '',
      ].filter(Boolean).join('\n'),
    }
  }

  yield { type: 'usage', usage: context.usage }

  chatMemory.push({ role: 'user', content: userMessage })
  chatMemory.push({ role: 'assistant', content: finalContent })
  await persistLongTermMemory(longTermMemory, userMessage, context.model)
}
