import type { AgentPlanTask, AgentTaskResult } from '@/src/lib/agent-planning'
import type { ChatWorkflowContext } from '@/src/lib/chat-workflow'
import type { LLMToolCall, LLMUsage } from '@/src/lib/llm'
import { serializeAgentTaskValue } from '@/src/lib/agent-planning'
import { llm } from '@/src/lib/llm'
import { buildPrompt, buildPromptBlock, buildRagPrompt } from '@/src/lib/prompt-builder'
import { generateQianwenEmbedding } from '@/src/lib/qianwen'
import { LocalVectorStore } from '@/src/lib/vector-store'
import { runPlannedWorkflow } from '@/src/lib/workflow-engine'
import { DEFAULT_RAG_TOP_K, EMPTY_USAGE } from './constants'
import { cloneUsage, subtractUsage } from './iteration-log-service'
import { executeToolCall } from './tool-service'

type ChatExecutionEvent
  = | { type: 'reasoning', content: string }
    | { type: 'text', content: string }

interface ExecuteChatPlanOptions {
  streamFinalAnswer?: boolean
}

export interface ChatPlanExecutionResult {
  state: ChatWorkflowContext
  results: Record<string, AgentTaskResult>
  usage: LLMUsage
}

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

function buildExecutorMessages(
  task: LlmPlanTask,
  context: ChatWorkflowContext,
  results: Record<string, AgentTaskResult>,
  isFinalStep: boolean,
) {
  return buildPrompt({
    role: 'executor',
    taskTitle: task.title,
    userMessage: context.userMessage,
    memory: buildPromptBlock('用户长期记忆：', context.userContext),
    conversationSummary: buildPromptBlock('历史摘要：', context.conversationSummary),
    recentHistory: buildPromptBlock('最近对话：', formatRecentHistory(context.history)),
    dependencyResults: buildPromptBlock('前置步骤结果：', formatDependencyResults(task, results)),
    taskPrompt: task.parameters.prompt,
    systemPrompt: task.parameters.systemPrompt ?? '',
    executionModeInstruction: isFinalStep
      ? '你当前执行的是最终输出步骤，直接给用户结果，不要解释 Planner/Executor 机制。'
      : '你当前执行的是中间步骤，只产出当前步骤结果本身。',
    outputConstraint: isFinalStep
      ? '直接输出给用户的最终结果，不要输出 JSON、步骤说明或多余前缀。'
      : '直接输出当前步骤结果，不要输出 JSON、步骤说明或多余前缀。',
  })
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
  const toolCall: LLMToolCall = {
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
  const completion = await llm.generate({
    model: context.model,
    messages: buildExecutorMessages(task, context, results, false),
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

export function mergeUsage(left: LLMUsage, right: LLMUsage) {
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
  const stream = llm.generateStream({
    model: context.model,
    messages: buildExecutorMessages(task, context, results, true),
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

async function runBufferedFinalLlmTask(
  task: LlmPlanTask,
  context: ChatWorkflowContext,
  results: Record<string, AgentTaskResult>,
) {
  const completion = await llm.generate({
    model: context.model,
    messages: buildExecutorMessages(task, context, results, true),
    temperature: task.parameters.temperature ?? 0.2,
  })

  const finalAnswer = completion.content.trim()

  return {
    context: {
      ...context,
      finalAnswer,
      usage: mergeUsage(context.usage, completion.usage),
    },
    result: {
      stepId: task.id,
      title: task.title,
      tool: task.tool,
      value: finalAnswer,
      summary: summarizeTaskValue(finalAnswer),
      usage: completion.usage,
    } satisfies AgentTaskResult,
  }
}

async function* executeChatTask(
  task: AgentPlanTask,
  context: ChatWorkflowContext,
  results: Record<string, AgentTaskResult>,
  isFinalStep: boolean,
  streamFinalAnswer: boolean,
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
    if (!streamFinalAnswer) {
      return await runBufferedFinalLlmTask(task, context, results)
    }

    return yield * runFinalLlmTask(task, context, results)
  }

  return await runSingleLlmTask(task, context, results)
}

export async function* executeChatPlan(
  context: ChatWorkflowContext,
  options: ExecuteChatPlanOptions = {},
): AsyncGenerator<ChatExecutionEvent, ChatPlanExecutionResult> {
  if (context.plannedTasks.length === 0) {
    return {
      state: context,
      results: context.taskResults,
      usage: cloneUsage(EMPTY_USAGE),
    }
  }

  const usageBaseline = cloneUsage(context.usage)
  const finalTaskId = context.plannedTasks.at(-1)?.id
  const streamFinalAnswer = options.streamFinalAnswer ?? true
  const workflow = runPlannedWorkflow(
    context.plannedTasks,
    {
      context,
      results: context.taskResults,
    },
    (task, state) => executeChatTask(task, state.context, state.results, task.id === finalTaskId, streamFinalAnswer),
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
    return {
      state: context,
      results: context.taskResults,
      usage: cloneUsage(EMPTY_USAGE),
    }
  }

  const nextState = {
    ...finalState.context,
    taskResults: finalState.results,
  }

  return {
    state: nextState,
    results: finalState.results,
    usage: subtractUsage(nextState.usage, usageBaseline),
  }
}
