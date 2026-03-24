import type { QianwenMessage } from '@/src/lib/qianwen'
import { createChatWorkflow } from '@/src/lib/chat-workflow'
import { LongTermMemory } from '@/src/lib/long-term-memory'
import { SummaryMemory } from '@/src/lib/memory'
import { buildRagPrompt } from '@/src/lib/prompt-builder'
import { generateQianwenChatCompletion, generateQianwenEmbedding } from '@/src/lib/qianwen'
import { LocalVectorStore } from '@/src/lib/vector-store'
import { runWorkflow } from '@/src/lib/workflow-engine'
import { CHAT_TOOLS, DEFAULT_RAG_TOP_K, EMPTY_USAGE, MAX_TOOL_ROUNDS } from './constants'
import { persistLongTermMemory } from './memory-service'
import { buildSystemPrompt, parseStructuredAssistantOutput, stripStructuredLabels } from './output-parser'
import { executeToolCall } from './tool-service'

const chatMemory = new SummaryMemory(6)
const longTermMemory = new LongTermMemory()
const vectorStore = new LocalVectorStore()

function mergeUsage(
  left: { prompt: number, completion: number, total: number },
  right: { prompt: number, completion: number, total: number },
) {
  return {
    prompt: left.prompt + right.prompt,
    completion: left.completion + right.completion,
    total: left.total + right.total,
  }
}

async function buildKnowledgeContext(userMessage: string) {
  const { vector } = await generateQianwenEmbedding(userMessage)
  const results = await vectorStore.search(vector, DEFAULT_RAG_TOP_K)
  const chunks = results.map(result => ({ text: result.text }))

  return {
    results,
    prompt: buildRagPrompt({
      question: userMessage,
      chunks,
    }),
  }
}

function buildWorkflowSummaryPrompt({
  userMessage,
  userContext,
  conversationSummary,
  history,
  knowledgePrompt,
}: {
  userMessage: string
  userContext: string
  conversationSummary: string
  history: Array<{ role: 'user' | 'assistant', content: string }>
  knowledgePrompt: string
}) {
  const historyText = history
    .slice(-6)
    .map(message => `${message.role}: ${message.content}`)
    .join('\n')

  return [
    '你是 Workflow Engine 中的 Summarize 步骤。',
    '请整理一份给下游 Generate 步骤使用的执行摘要。',
    '摘要要覆盖用户当前问题、相关上下文、已知约束、回答重点。',
    '保持简洁，使用 4-6 条项目符号。',
    '',
    `用户当前问题：${userMessage}`,
    userContext ? `用户画像：\n${userContext}` : '',
    conversationSummary ? `历史摘要：\n${conversationSummary}` : '',
    historyText ? `最近对话：\n${historyText}` : '',
    `检索上下文：\n${knowledgePrompt}`,
  ].filter(Boolean).join('\n\n')
}

function buildReviewPrompt({
  userMessage,
  responseBrief,
  draftAnswer,
  knowledgePrompt,
}: {
  userMessage: string
  responseBrief: string
  draftAnswer: string
  knowledgePrompt: string
}) {
  return [
    '你是 Workflow Engine 中的 Review 步骤。',
    '请审查下面的回答是否准确、简洁，并优先遵循检索上下文。',
    '如果原回答已经足够好，请只输出润色后的最终答案。',
    '不要解释你的审查过程，不要输出标题。',
    '',
    `用户问题：${userMessage}`,
    `执行摘要：\n${responseBrief}`,
    `检索上下文：\n${knowledgePrompt}`,
    `待审查回答：\n${draftAnswer}`,
  ].join('\n\n')
}

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

async function generateAssistantDraft({
  userMessage,
  history,
  summary,
  userContext,
  knowledgePrompt,
  responseBrief,
}: {
  userMessage: string
  history: Array<{ role: 'user' | 'assistant', content: string }>
  summary: string
  userContext: string
  knowledgePrompt: string
  responseBrief: string
}) {
  const llmMessages: QianwenMessage[] = [
    { role: 'system', content: buildSystemPrompt() },
  ]

  if (userContext) {
    llmMessages.push({
      role: 'system',
      content: `用户信息：\n${userContext}`,
    })
  }

  if (summary) {
    llmMessages.push({
      role: 'system',
      content: `对话摘要：\n${summary}`,
    })
  }

  llmMessages.push({
    role: 'system',
    content: knowledgePrompt,
  })

  if (responseBrief) {
    llmMessages.push({
      role: 'system',
      content: `工作流摘要：\n${responseBrief}`,
    })
  }

  llmMessages.push(
    ...history.map(message => ({ role: message.role, content: message.content })),
    { role: 'user', content: userMessage },
  )

  const totalUsage = { prompt: 0, completion: 0, total: 0 }

  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    const completion = await generateQianwenChatCompletion({
      messages: llmMessages,
      tools: CHAT_TOOLS,
      temperature: 0.2,
    })

    totalUsage.prompt += completion.usage.prompt
    totalUsage.completion += completion.usage.completion
    totalUsage.total += completion.usage.total

    const parsedCompletion = parseStructuredAssistantOutput(completion.content)

    if (completion.toolCalls.length === 0) {
      const finalContent = stripStructuredLabels(
        parsedCompletion.hasFinalAnswer ? parsedCompletion.answer : completion.content,
      ).trim()

      return {
        answer: finalContent,
        usage: totalUsage,
      }
    }

    llmMessages.push({
      role: 'assistant',
      content: completion.content || null,
      tool_calls: completion.toolCalls,
    })

    for (const toolCall of completion.toolCalls) {
      const toolResult = await executeToolCall(toolCall)
      llmMessages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        name: toolCall.function.name,
        content: JSON.stringify(toolResult),
      })
    }
  }

  throw new Error('工具调用轮次超出限制，请重试。')
}

// 编排层只关心“这次请求怎样被处理”，不关心 HTTP 细节。
export async function* generateChatStream(userMessage: string) {
  if (chatMemory.shouldSummarize()) {
    const toSummarize = chatMemory.getMessagesToSummarize()
    const newSummary = await generateSummary(toSummarize)
    chatMemory.setSummary(newSummary)
    chatMemory.clearOldMessages()
  }

  await longTermMemory.load()

  const workflow = createChatWorkflow({
    async search(context) {
      const knowledgeContext = await buildKnowledgeContext(context.userMessage)
      return {
        knowledgeResults: knowledgeContext.results,
        knowledgePrompt: knowledgeContext.prompt,
      }
    },
    async summarize(context) {
      const summaryPrompt = buildWorkflowSummaryPrompt({
        userMessage: context.userMessage,
        userContext: context.userContext,
        conversationSummary: context.conversationSummary,
        history: context.history,
        knowledgePrompt: context.knowledgePrompt,
      })

      const completion = await generateQianwenChatCompletion({
        messages: [{ role: 'user', content: summaryPrompt }],
        temperature: 0.2,
      })

      return {
        responseBrief: completion.content.trim(),
      }
    },
    async generate(context) {
      const result = await generateAssistantDraft({
        userMessage: context.userMessage,
        history: context.history,
        summary: context.conversationSummary,
        userContext: context.userContext,
        knowledgePrompt: context.knowledgePrompt,
        responseBrief: context.responseBrief,
      })

      return {
        draftAnswer: result.answer,
        usage: mergeUsage(context.usage, result.usage),
      }
    },
    async review(context) {
      const completion = await generateQianwenChatCompletion({
        messages: [{
          role: 'user',
          content: buildReviewPrompt({
            userMessage: context.userMessage,
            responseBrief: context.responseBrief,
            draftAnswer: context.draftAnswer,
            knowledgePrompt: context.knowledgePrompt,
          }),
        }],
        temperature: 0.1,
      })

      const finalAnswer = completion.content.trim() || context.draftAnswer

      return {
        finalAnswer,
        usage: mergeUsage(context.usage, completion.usage),
      }
    },
  })

  const initialContext = {
    userMessage,
    history: chatMemory.getHistory(),
    conversationSummary: chatMemory.getSummary(),
    userContext: longTermMemory.toContextString(),
    knowledgeResults: [],
    knowledgePrompt: '',
    responseBrief: '',
    draftAnswer: '',
    finalAnswer: '',
    usage: EMPTY_USAGE,
  }

  const stepEvents: string[] = []
  const workflowResult = await runWorkflow(workflow, initialContext, {
    onStepStart(step) {
      stepEvents.push(`执行步骤：${step.name}`)
    },
  })

  for (const event of stepEvents) {
    yield { type: 'reasoning', content: event }
  }

  const finalContent = workflowResult.finalAnswer || workflowResult.draftAnswer
  yield { type: 'text', content: finalContent }
  yield { type: 'usage', usage: workflowResult.usage }

  chatMemory.push({ role: 'user', content: userMessage })
  chatMemory.push({ role: 'assistant', content: finalContent })
  await persistLongTermMemory(longTermMemory, userMessage, finalContent)
}
