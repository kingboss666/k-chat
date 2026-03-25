import type { ChatWorkflowContext } from '@/src/lib/chat-workflow'
import { LongTermMemory } from '@/src/lib/long-term-memory'
import { SummaryMemory } from '@/src/lib/memory'
import { generateQianwenChatCompletion } from '@/src/lib/qianwen'
import { EMPTY_USAGE } from './constants'
import { executeChatPlan, mergeUsage } from './executor-service'
import { persistLongTermMemory } from './memory-service'
import { planChatTasks } from './planner-service'

const chatMemory = new SummaryMemory(6)
const longTermMemory = new LongTermMemory()

async function generateSummary(messages: Array<{ role: 'user' | 'assistant', content: string }>) {
  const conversationText = messages
    .map(msg => `${msg.role}: ${msg.content}`)
    .join('\n')

  const summaryPrompt = `请总结以下对话的关键信息，包括用户背景、讨论主题、重要结论等。保持简洁，不超过200字。

对话内容：
${conversationText}

总结：`

  const completion = await generateQianwenChatCompletion({
    messages: [{ role: 'user', content: summaryPrompt }],
    temperature: 0.3,
  })

  return completion.content.trim()
}

// 编排层只关心“这次请求怎样被处理”，不关心 HTTP 细节。
export async function* generateChatStream(userMessage: string) {
  if (chatMemory.shouldSummarize()) {
    yield { type: 'reasoning', content: '执行步骤：更新历史摘要' }
    const toSummarize = chatMemory.getMessagesToSummarize()
    const newSummary = await generateSummary(toSummarize)
    chatMemory.setSummary(newSummary)
    chatMemory.clearOldMessages()
  }

  await longTermMemory.load()
  const context: ChatWorkflowContext = {
    userMessage,
    history: chatMemory.getHistory(),
    conversationSummary: chatMemory.getSummary(),
    userContext: longTermMemory.toContextString(),
    plannedTasks: [],
    taskResults: {},
    knowledgeResults: [],
    knowledgePrompt: '',
    finalAnswer: '',
    usage: EMPTY_USAGE,
  }

  yield { type: 'reasoning', content: '执行步骤：Planner' }
  const planningResult = await planChatTasks(context)
  context.plannedTasks = planningResult.tasks
  context.usage = mergeUsage(context.usage, planningResult.usage)

  yield {
    type: 'reasoning',
    content: `Planner 已生成 ${context.plannedTasks.length} 个步骤：${context.plannedTasks.map(task => task.id).join(' -> ')}`,
  }

  const executionStream = executeChatPlan(context)
  const iterator = executionStream[Symbol.asyncIterator]()
  let executedContext: ChatWorkflowContext | undefined

  while (true) {
    const iteration = await iterator.next()

    if (iteration.done) {
      executedContext = iteration.value
      break
    }

    yield iteration.value
  }

  const resolvedContext = executedContext ?? context
  const finalTask = resolvedContext.plannedTasks.at(-1)
  const finalTaskValue = finalTask ? resolvedContext.taskResults[finalTask.id]?.value : ''
  const finalContent = resolvedContext.finalAnswer
    || (typeof finalTaskValue === 'string' ? finalTaskValue.trim() : '')

  yield { type: 'usage', usage: resolvedContext.usage }

  chatMemory.push({ role: 'user', content: userMessage })
  chatMemory.push({ role: 'assistant', content: finalContent })
  await persistLongTermMemory(longTermMemory, userMessage, finalContent)
}
