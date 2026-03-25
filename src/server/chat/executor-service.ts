import type { AgentPlanTask, AgentTaskResult } from '@/src/lib/agent-planning'
import type { ChatWorkflowContext } from '@/src/lib/chat-workflow'
import type { QianwenToolCall, QianwenUsage } from '@/src/lib/qianwen'
import { serializeAgentTaskValue } from '@/src/lib/agent-planning'
import { buildRagPrompt } from '@/src/lib/prompt-builder'
import {
  generateQianwenChatCompletion,
  generateQianwenChatCompletionStream,
  generateQianwenEmbedding,
} from '@/src/lib/qianwen'
import { LocalVectorStore } from '@/src/lib/vector-store'
import { runPlannedWorkflow } from '@/src/lib/workflow-engine'
import { DEFAULT_RAG_TOP_K, EMPTY_USAGE } from './constants'
import { executeToolCall } from './tool-service'

type ChatExecutionEvent
  = | { type: 'reasoning', content: string }
    | { type: 'text', content: string }

type RagPlanTask = Extract<AgentPlanTask, { tool: 'RAG' }>
type LlmPlanTask = Extract<AgentPlanTask, { tool: 'LLM' }>
type ToolPlanTask = Extract<AgentPlanTask, { tool: 'TOOL' }>

const vectorStore = new LocalVectorStore()

function normalizeTextPreview(content: string) {
  const normalized = content.replace(/\s+/g, ' ').trim()
  if (!normalized) {
    return ''
  }

  return normalized.length > 120 ? `${normalized.slice(0, 120)}...` : normalized
}

function formatRecentHistory(history: ChatWorkflowContext['history']) {
  return history
    .slice(-6)
    .map(message => `${message.role}: ${message.content}`)
    .join('\n')
}

function formatTaskResult(result: AgentTaskResult) {
  return [
    `步骤 ID：${result.stepId}`,
    `步骤标题：${result.title}`,
    `工具类型：${result.tool}`,
    `步骤摘要：${result.summary}`,
    `步骤结果：\n${serializeAgentTaskValue(result.value)}`,
  ].join('\n')
}

function formatDependencyResults(task: AgentPlanTask, results: Record<string, AgentTaskResult>) {
  return task.dependsOn
    .map(stepId => results[stepId])
    .filter(Boolean)
    .map(result => formatTaskResult(result))
    .join('\n\n')
}

function buildExecutorSystemPrompt(task: LlmPlanTask, isFinalStep: boolean) {
  return [
    '你是 Executor Agent，负责执行当前单个任务步骤。',
    '只根据提供的用户问题、上下文和前置结果完成当前步骤。',
    '如果缺少必要信息，要明确说明限制，不要编造。',
    isFinalStep
      ? '你当前执行的是最终输出步骤，直接给用户结果，不要解释 Planner/Executor 机制。'
      : '你当前执行的是中间步骤，只产出当前步骤结果本身。',
    task.parameters.systemPrompt ?? '',
  ].filter(Boolean).join('\n')
}

function buildExecutorUserPrompt(
  task: LlmPlanTask,
  context: ChatWorkflowContext,
  results: Record<string, AgentTaskResult>,
  isFinalStep: boolean,
) {
  const recentHistory = formatRecentHistory(context.history)
  const dependencyResults = formatDependencyResults(task, results)

  return [
    `当前步骤：${task.title}`,
    `原始用户问题：${context.userMessage}`,
    context.userContext ? `用户长期记忆：\n${context.userContext}` : '',
    context.conversationSummary ? `历史摘要：\n${context.conversationSummary}` : '',
    recentHistory ? `最近对话：\n${recentHistory}` : '',
    dependencyResults ? `前置步骤结果：\n${dependencyResults}` : '',
    `执行要求：\n${task.parameters.prompt}`,
    isFinalStep
      ? '直接输出给用户的最终结果，不要输出 JSON、步骤说明或多余前缀。'
      : '直接输出当前步骤结果，不要输出 JSON、步骤说明或多余前缀。',
  ].filter(Boolean).join('\n\n')
}

function summarizeTaskValue(value: unknown) {
  if (typeof value === 'string') {
    return normalizeTextPreview(value)
  }

  if (value && typeof value === 'object' && 'error' in value) {
    return `执行失败：${String((value as { error: unknown }).error)}`
  }

  return normalizeTextPreview(serializeAgentTaskValue(value))
}

async function runRagTask(task: RagPlanTask, context: ChatWorkflowContext) {
  const topK = task.parameters.topK ?? DEFAULT_RAG_TOP_K
  const { vector } = await generateQianwenEmbedding(task.parameters.query)
  const results = await vectorStore.search(vector, topK)
  const prompt = buildRagPrompt({
    question: task.parameters.query,
    chunks: results.map(result => ({ text: result.text })),
  })

  const value = {
    query: task.parameters.query,
    topK,
    prompt,
    matches: results,
  }

  return {
    context: {
      ...context,
      knowledgeResults: results,
      knowledgePrompt: prompt,
    },
    result: {
      stepId: task.id,
      title: task.title,
      tool: task.tool,
      value,
      summary: results.length > 0 ? `检索到 ${results.length} 条相关知识片段。` : '没有检索到相关知识片段。',
    } satisfies AgentTaskResult,
  }
}

async function runToolTask(task: ToolPlanTask) {
  const toolCall: QianwenToolCall = {
    id: `planned-tool-${task.id}`,
    type: 'function',
    function: {
      name: task.parameters.name,
      arguments: JSON.stringify(task.parameters.arguments),
    },
  }

  const value = await executeToolCall(toolCall)

  return {
    result: {
      stepId: task.id,
      title: task.title,
      tool: task.tool,
      value,
      summary: summarizeTaskValue(value),
    } satisfies AgentTaskResult,
  }
}

async function runSingleLlmTask(
  task: LlmPlanTask,
  context: ChatWorkflowContext,
  results: Record<string, AgentTaskResult>,
) {
  const completion = await generateQianwenChatCompletion({
    messages: [
      {
        role: 'system',
        content: buildExecutorSystemPrompt(task, false),
      },
      {
        role: 'user',
        content: buildExecutorUserPrompt(task, context, results, false),
      },
    ],
    temperature: task.parameters.temperature ?? 0.2,
  })

  const value = completion.content.trim()

  return {
    context: {
      ...context,
      usage: mergeUsage(context.usage, completion.usage),
    },
    result: {
      stepId: task.id,
      title: task.title,
      tool: task.tool,
      value,
      summary: summarizeTaskValue(value),
      usage: completion.usage,
    } satisfies AgentTaskResult,
  }
}

export function mergeUsage(left: QianwenUsage, right: QianwenUsage) {
  return {
    prompt: left.prompt + right.prompt,
    completion: left.completion + right.completion,
    total: left.total + right.total,
  }
}

async function* runFinalLlmTask(
  task: LlmPlanTask,
  context: ChatWorkflowContext,
  results: Record<string, AgentTaskResult>,
): AsyncGenerator<ChatExecutionEvent, { context: ChatWorkflowContext, result: AgentTaskResult }, void> {
  const stream = await generateQianwenChatCompletionStream({
    messages: [
      {
        role: 'system',
        content: buildExecutorSystemPrompt(task, true),
      },
      {
        role: 'user',
        content: buildExecutorUserPrompt(task, context, results, true),
      },
    ],
    temperature: task.parameters.temperature ?? 0.2,
  })

  let streamedText = ''
  let usage = { ...EMPTY_USAGE }

  for await (const event of stream) {
    if (event.type === 'text') {
      streamedText += event.content
      yield { type: 'text', content: event.content }
      continue
    }

    usage = event.result.usage
    streamedText = event.result.content.trim() || streamedText.trim()
  }

  const finalAnswer = streamedText.trim()

  return {
    context: {
      ...context,
      finalAnswer,
      usage: mergeUsage(context.usage, usage),
    },
    result: {
      stepId: task.id,
      title: task.title,
      tool: task.tool,
      value: finalAnswer,
      summary: summarizeTaskValue(finalAnswer),
      usage,
    },
  }
}

async function* executeChatTask(
  task: AgentPlanTask,
  context: ChatWorkflowContext,
  results: Record<string, AgentTaskResult>,
  isFinalStep: boolean,
): AsyncGenerator<ChatExecutionEvent, { context?: ChatWorkflowContext, result: AgentTaskResult }, void> {
  yield {
    type: 'reasoning',
    content: `执行步骤：${task.title}`,
  }

  if (task.tool === 'RAG') {
    return await runRagTask(task, context)
  }

  if (task.tool === 'TOOL') {
    return await runToolTask(task)
  }

  if (isFinalStep) {
    return yield * runFinalLlmTask(task, context, results)
  }

  return await runSingleLlmTask(task, context, results)
}

export async function* executeChatPlan(
  context: ChatWorkflowContext,
): AsyncGenerator<ChatExecutionEvent, ChatWorkflowContext> {
  if (context.plannedTasks.length === 0) {
    return context
  }

  const finalTaskId = context.plannedTasks.at(-1)?.id
  const workflow = runPlannedWorkflow(
    context.plannedTasks,
    {
      context,
      results: context.taskResults,
    },
    (task, state) => executeChatTask(task, state.context, state.results, task.id === finalTaskId),
  )

  const iterator = workflow[Symbol.asyncIterator]()
  let finalState:
    | {
      context: ChatWorkflowContext
      results: Record<string, AgentTaskResult>
    }
    | undefined

  while (true) {
    const iteration = await iterator.next()

    if (iteration.done) {
      finalState = iteration.value
      break
    }

    yield iteration.value
  }

  if (!finalState) {
    return context
  }

  return {
    ...finalState.context,
    taskResults: finalState.results,
  }
}
