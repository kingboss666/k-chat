import type { AgentPlanTask, AgentTaskResult } from '@/src/lib/agent-planning'
import type { QianwenUsage } from '@/src/lib/qianwen'
import type { VectorSearchResult } from '@/src/lib/vector-store'

export interface ChatEvaluation {
  success: boolean
  reason: string
  nextAction: string
}

export interface ChatWorkflowContext {
  userMessage: string
  history: Array<{ role: 'user' | 'assistant', content: string }>
  conversationSummary: string
  userContext: string
  iteration: number
  maxIterations: number
  lastResult: string
  feedback: string
  plannedTasks: AgentPlanTask[]
  taskResults: Record<string, AgentTaskResult>
  knowledgeResults: VectorSearchResult[]
  knowledgePrompt: string
  finalAnswer: string
  evaluations: ChatEvaluation[]
  usage: QianwenUsage
}
