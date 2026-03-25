import type { AgentPlanTask, AgentTaskResult } from '@/src/lib/agent-planning'
import type { QianwenUsage } from '@/src/lib/qianwen'
import type { VectorSearchResult } from '@/src/lib/vector-store'

export interface ChatWorkflowContext {
  userMessage: string
  history: Array<{ role: 'user' | 'assistant', content: string }>
  conversationSummary: string
  userContext: string
  plannedTasks: AgentPlanTask[]
  taskResults: Record<string, AgentTaskResult>
  knowledgeResults: VectorSearchResult[]
  knowledgePrompt: string
  finalAnswer: string
  usage: QianwenUsage
}
