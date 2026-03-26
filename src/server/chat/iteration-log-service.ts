import type { AgentPlanTask, AgentTaskResult } from '@/src/lib/agent-planning'
import type { ChatEvaluation } from '@/src/lib/chat-workflow'
import type { QianwenUsage } from '@/src/lib/qianwen'
import { appendFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { serializeAgentTaskValue } from '@/src/lib/agent-planning'

export interface ChatIterationLatencyLog {
  planningMs: number
  executionMs: number
  evaluationMs: number
  totalMs: number
}

export interface ChatIterationUsageLog {
  planning: QianwenUsage
  execution: QianwenUsage
  evaluation: QianwenUsage
  total: QianwenUsage
}

export interface ChatIterationResultLog {
  finalAnswer: string
  taskResults: Array<{
    stepId: string
    title: string
    tool: AgentTaskResult['tool']
    summary: string
    value: string
  }>
}

export interface ChatIterationLogEntry {
  requestId: string
  timestamp: string
  userGoal: string
  iteration: number
  plan: AgentPlanTask[]
  result: ChatIterationResultLog
  evaluation: ChatEvaluation
  latency: ChatIterationLatencyLog
  usage: ChatIterationUsageLog
}

const CHAT_ITERATION_LOG_DIR = path.join(process.cwd(), '.memory', 'chat-iteration-logs')

function roundMetric(value: number) {
  return Math.round(value * 10) / 10
}

export function cloneUsage(usage: QianwenUsage): QianwenUsage {
  return {
    prompt: usage.prompt,
    completion: usage.completion,
    total: usage.total,
  }
}

export function subtractUsage(after: QianwenUsage, before: QianwenUsage): QianwenUsage {
  return {
    prompt: Math.max(0, after.prompt - before.prompt),
    completion: Math.max(0, after.completion - before.completion),
    total: Math.max(0, after.total - before.total),
  }
}

export function buildIterationResultLog(
  finalAnswer: string,
  taskResults: Record<string, AgentTaskResult>,
): ChatIterationResultLog {
  return {
    finalAnswer,
    taskResults: Object.values(taskResults).map(result => ({
      stepId: result.stepId,
      title: result.title,
      tool: result.tool,
      summary: result.summary,
      value: serializeAgentTaskValue(result.value),
    })),
  }
}

function getLogFilePath(timestamp: string) {
  return path.join(CHAT_ITERATION_LOG_DIR, `${timestamp.slice(0, 10)}.jsonl`)
}

export async function appendChatIterationLog(entry: ChatIterationLogEntry) {
  const normalizedEntry: ChatIterationLogEntry = {
    ...entry,
    latency: {
      planningMs: roundMetric(entry.latency.planningMs),
      executionMs: roundMetric(entry.latency.executionMs),
      evaluationMs: roundMetric(entry.latency.evaluationMs),
      totalMs: roundMetric(entry.latency.totalMs),
    },
  }

  try {
    await mkdir(CHAT_ITERATION_LOG_DIR, { recursive: true })
    await appendFile(
      getLogFilePath(entry.timestamp),
      `${JSON.stringify(normalizedEntry)}\n`,
      'utf8',
    )
  }
  catch (error) {
    console.error('Failed to write chat iteration log:', error)
  }
}
