import type { QianwenUsage } from '@/src/lib/qianwen'
import type { VectorSearchResult } from '@/src/lib/vector-store'
import type { WorkflowStep } from '@/src/lib/workflow-engine'

export interface ChatWorkflowContext {
  userMessage: string
  history: Array<{ role: 'user' | 'assistant', content: string }>
  conversationSummary: string
  userContext: string
  knowledgeResults: VectorSearchResult[]
  knowledgePrompt: string
  responseBrief: string
  draftAnswer: string
  finalAnswer: string
  usage: QianwenUsage
}

interface ChatWorkflowDependencies {
  search: (context: ChatWorkflowContext) => Promise<Pick<ChatWorkflowContext, 'knowledgeResults' | 'knowledgePrompt'>>
  summarize: (context: ChatWorkflowContext) => Promise<Pick<ChatWorkflowContext, 'responseBrief'>>
  generate: (context: ChatWorkflowContext) => Promise<Pick<ChatWorkflowContext, 'draftAnswer' | 'usage'>>
  review: (context: ChatWorkflowContext) => Promise<Pick<ChatWorkflowContext, 'finalAnswer' | 'usage'>>
}

export function createChatWorkflow(dependencies: ChatWorkflowDependencies): WorkflowStep<ChatWorkflowContext>[] {
  const searchStep: WorkflowStep<ChatWorkflowContext> = {
    name: 'Search',
    async run(context) {
      return {
        ...context,
        ...(await dependencies.search(context)),
      }
    },
  }

  const summarizeStep: WorkflowStep<ChatWorkflowContext> = {
    name: 'Summarize',
    async run(context) {
      return {
        ...context,
        ...(await dependencies.summarize(context)),
      }
    },
  }

  const generateStep: WorkflowStep<ChatWorkflowContext> = {
    name: 'Generate',
    async run(context) {
      return {
        ...context,
        ...(await dependencies.generate(context)),
      }
    },
  }

  const reviewStep: WorkflowStep<ChatWorkflowContext> = {
    name: 'Review',
    async run(context) {
      return {
        ...context,
        ...(await dependencies.review(context)),
      }
    },
  }

  return [searchStep, summarizeStep, generateStep, reviewStep]
}
