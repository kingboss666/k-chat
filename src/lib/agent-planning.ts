import type { QianwenUsage } from '@/src/lib/qianwen'
import { z } from 'zod'

const TaskIdSchema = z.string().trim().regex(/^[a-z][a-z0-9_-]{1,63}$/)

const PlannedTaskBaseSchema = z.object({
  id: TaskIdSchema,
  title: z.string().trim().min(1).max(120),
  dependsOn: z.array(TaskIdSchema).max(8).default([]),
})

const RagTaskParametersSchema = z.object({
  query: z.string().trim().min(1),
  topK: z.number().int().min(1).max(8).optional(),
})

const LlmTaskParametersSchema = z.object({
  prompt: z.string().trim().min(1),
  systemPrompt: z.string().trim().min(1).optional(),
  temperature: z.number().min(0).max(1).optional(),
})

const ToolTaskParametersSchema = z.object({
  name: z.enum(['get_weather', 'get_time', 'calculate_expression']),
  arguments: z.record(z.string(), z.unknown()).default({}),
})

export const AgentPlanningToolSchema = z.enum(['RAG', 'LLM', 'TOOL'])

export const AgentPlanTaskSchema = z.discriminatedUnion('tool', [
  PlannedTaskBaseSchema.extend({
    tool: z.literal('RAG'),
    parameters: RagTaskParametersSchema,
  }),
  PlannedTaskBaseSchema.extend({
    tool: z.literal('LLM'),
    parameters: LlmTaskParametersSchema,
  }),
  PlannedTaskBaseSchema.extend({
    tool: z.literal('TOOL'),
    parameters: ToolTaskParametersSchema,
  }),
])

export const AgentPlanSchema = z.object({
  tasks: z.array(AgentPlanTaskSchema).min(1).max(8),
})

export type AgentPlanningTool = z.infer<typeof AgentPlanningToolSchema>
export type AgentPlanTask = z.infer<typeof AgentPlanTaskSchema>
export type AgentPlan = z.infer<typeof AgentPlanSchema>

export interface AgentTaskResult {
  stepId: string
  title: string
  tool: AgentPlanningTool
  value: unknown
  summary: string
  usage?: QianwenUsage
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

export function validateAgentPlan(tasks: AgentPlanTask[]) {
  const visitedTaskIds = new Set<string>()

  for (const task of tasks) {
    if (visitedTaskIds.has(task.id)) {
      throw new Error(`Planner 返回了重复步骤 ID：${task.id}`)
    }

    for (const dependencyId of task.dependsOn) {
      if (!visitedTaskIds.has(dependencyId)) {
        throw new Error(`步骤 ${task.id} 依赖了未定义或顺序错误的步骤：${dependencyId}`)
      }
    }

    visitedTaskIds.add(task.id)
  }

  if (tasks.at(-1)?.tool !== 'LLM') {
    throw new Error('Planner 的最后一步必须是 LLM。')
  }
}

export function parseAgentPlan(content: string): AgentPlan {
  const parsed = AgentPlanSchema.parse(JSON.parse(extractJsonObject(content)))
  validateAgentPlan(parsed.tasks)
  return parsed
}

export function serializeAgentTaskValue(value: unknown) {
  if (typeof value === 'string') {
    return value.trim()
  }

  try {
    return JSON.stringify(value, null, 2)
  }
  catch {
    return String(value)
  }
}
