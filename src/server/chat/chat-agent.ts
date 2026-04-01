import type { AgentLifecycle, AgentRunHooks } from '@/src/lib/agent'
import type { AgentPlanTask, AgentTaskResult } from '@/src/lib/agent-planning'
import type { ChatEvaluation, ChatWorkflowContext } from '@/src/lib/chat-workflow'
import type { LLMUsage } from '@/src/lib/llm'
import { randomUUID } from 'node:crypto'
import { Agent } from '@/src/lib/agent'
import { llm } from '@/src/lib/llm'
import { LongTermMemory } from '@/src/lib/long-term-memory'
import { SummaryMemory } from '@/src/lib/memory'
import { buildPrompt } from '@/src/lib/prompt-builder'
import { EMPTY_USAGE, MAX_CHAT_ITERATIONS } from './constants'
import { evaluateChatResult } from './evaluator-service'
import { executeChatPlan, mergeUsage } from './executor-service'
import {
  appendChatIterationLog,
  buildIterationResultLog,
  cloneUsage,
} from './iteration-log-service'
import { persistLongTermMemory } from './memory-service'
import { planChatTasks } from './planner-service'

export type ChatStreamEvent
  = | { type: 'reasoning', content: string }
    | { type: 'text', content: string }
    | { type: 'usage', usage: LLMUsage }

export interface ChatAgentInput {
  userMessage: string
  model: string
}

const chatMemory = new SummaryMemory(6)
const longTermMemory = new LongTermMemory()

async function generateSummary(
  messages: Array<{ role: 'user' | 'assistant', content: string }>,
  model: string,
) {
  const conversationText = messages
    .map(message => `${message.role}: ${message.content}`)
    .join('\n')

  const completion = await llm.generate({
    model,
    messages: buildPrompt({
      role: 'summary',
      conversationText,
    }),
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

function buildIterationTotalUsage(...usages: Array<LLMUsage | undefined>): LLMUsage {
  return usages.reduce(
    (total: LLMUsage, usage: LLMUsage | undefined) => mergeUsage(total, usage ?? cloneUsage(EMPTY_USAGE)),
    cloneUsage(EMPTY_USAGE),
  )
}

const chatLifecycle: AgentLifecycle<
  ChatWorkflowContext,
  AgentPlanTask,
  AgentTaskResult,
  ChatEvaluation,
  LLMUsage
> = {
  startIteration(state) {
    return {
      ...state,
      iteration: state.iteration + 1,
      plannedTasks: [],
      taskResults: {},
      knowledgeResults: [],
      knowledgePrompt: '',
      finalAnswer: '',
    }
  },

  applyPlan(state, plan) {
    const nextState = plan.state ?? state

    return {
      ...nextState,
      plannedTasks: plan.tasks,
      usage: mergeUsage(nextState.usage, plan.usage ?? cloneUsage(EMPTY_USAGE)),
    }
  },

  applyExecution(state, execution) {
    const nextState = execution.state ?? state
    const finalAnswer = resolveFinalContent(nextState)

    return {
      ...nextState,
      taskResults: execution.results,
      finalAnswer,
    }
  },

  applyEvaluation(state, evaluation) {
    return {
      ...state,
      evaluations: [...state.evaluations, evaluation.evaluation],
      usage: mergeUsage(state.usage, evaluation.usage ?? cloneUsage(EMPTY_USAGE)),
    }
  },

  decideNext(state, evaluation) {
    if (evaluation.success || state.iteration >= state.maxIterations) {
      return { type: 'finish' as const }
    }

    return {
      type: 'retry' as const,
      state: {
        ...state,
        lastResult: resolveFinalContent(state),
        feedback: [
          `失败原因：${evaluation.reason}`,
          evaluation.nextAction.trim() ? `修正建议：${evaluation.nextAction.trim()}` : '',
        ].filter(Boolean).join('\n'),
      },
    }
  },
}

function createChatHooks(
  requestId: string,
): AgentRunHooks<
    ChatAgentInput,
    ChatWorkflowContext,
    AgentPlanTask,
    AgentTaskResult,
    ChatEvaluation,
    ChatStreamEvent,
    LLMUsage
  > {
  return {
    async *onRunStart(input) {
      if (!chatMemory.shouldSummarize()) {
        return
      }

      yield { type: 'reasoning', content: '执行步骤：更新历史摘要' }

      const toSummarize = chatMemory.getMessagesToSummarize()
      const newSummary = await generateSummary(toSummarize, input.model)
      chatMemory.setSummary(newSummary)
      chatMemory.clearOldMessages()
    },

    onIterationStart(state) {
      return {
        type: 'reasoning',
        content: `执行轮次：${state.iteration}/${state.maxIterations}`,
      }
    },

    onPlanningStart() {
      return { type: 'reasoning', content: '执行步骤：Planner' }
    },

    onPlanningComplete({ state, plan }) {
      return {
        type: 'reasoning',
        content: `Planner 已生成 ${plan.tasks.length} 个步骤：${state.plannedTasks.map(task => task.id).join(' -> ')}`,
      }
    },

    onEvaluationStart(state) {
      return {
        type: 'reasoning',
        content: `执行步骤：Evaluator（第 ${state.iteration} 轮）`,
      }
    },

    async afterIteration({ input, state, plan, execution, evaluation, metrics }) {
      await appendChatIterationLog({
        requestId,
        timestamp: new Date().toISOString(),
        userGoal: input.userMessage,
        iteration: state.iteration,
        plan: plan.tasks,
        result: buildIterationResultLog(resolveFinalContent(state), state.taskResults),
        evaluation: evaluation.evaluation,
        latency: {
          planningMs: metrics.planningMs,
          executionMs: metrics.executionMs,
          evaluationMs: metrics.evaluationMs,
          totalMs: metrics.totalMs,
        },
        usage: {
          planning: plan.usage ?? cloneUsage(EMPTY_USAGE),
          execution: execution.usage ?? cloneUsage(EMPTY_USAGE),
          evaluation: evaluation.usage ?? cloneUsage(EMPTY_USAGE),
          total: buildIterationTotalUsage(plan.usage, execution.usage, evaluation.usage),
        },
      })
    },

    async *onRetry({ evaluation }) {
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
    },

    async *onFinish({ state, evaluation }) {
      if (evaluation.success) {
        yield {
          type: 'reasoning',
          content: `Evaluator 通过：${evaluation.reason}`,
        }
      }
      else {
        yield {
          type: 'reasoning',
          content: `Evaluator 未通过，已达到最大迭代次数：${evaluation.reason}`,
        }
      }

      for (const chunk of splitTextIntoChunks(resolveFinalContent(state))) {
        yield { type: 'text', content: chunk }
      }
    },

    onRunComplete({ state }) {
      return {
        type: 'usage',
        usage: state.usage,
      }
    },
  }
}

export function createChatAgent(requestId = randomUUID()) {
  return new Agent<
    ChatAgentInput,
    ChatWorkflowContext,
    AgentPlanTask,
    AgentTaskResult,
    ChatEvaluation,
    ChatStreamEvent,
    LLMUsage
  >({
    planner: {
      plan: planChatTasks,
    },
    executor: {
      execute: state => executeChatPlan(state, { streamFinalAnswer: false }),
    },
    evaluator: {
      evaluate: state => evaluateChatResult({
        model: state.model,
        userGoal: state.userMessage,
        currentResult: resolveFinalContent(state),
      }),
    },
    memory: {
      async initialize(input) {
        await longTermMemory.load()

        return {
          model: input.model,
          userMessage: input.userMessage,
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
          usage: cloneUsage(EMPTY_USAGE),
        }
      },

      async finalize({ input, state }) {
        const finalContent = resolveFinalContent(state)
        chatMemory.push({ role: 'user', content: input.userMessage })
        chatMemory.push({ role: 'assistant', content: finalContent })
        await persistLongTermMemory(longTermMemory, input.userMessage, state.model)
      },
    },
    lifecycle: chatLifecycle,
    hooks: createChatHooks(requestId),
  })
}
