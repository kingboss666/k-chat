import type { AgentPlanTask } from '@/src/lib/agent-planning'
import type { ChatWorkflowContext } from '@/src/lib/chat-workflow'
import { parseAgentPlan } from '@/src/lib/agent-planning'
import { llm } from '@/src/lib/llm'
import { buildPrompt, buildPromptBlock } from '@/src/lib/prompt-builder'
import { generateQianwenEmbedding } from '@/src/lib/qianwen'
import { LocalVectorStore } from '@/src/lib/vector-store'
import { CHAT_TOOLS, DEFAULT_RAG_TOP_K, EMPTY_USAGE } from './constants'

const planningVectorStore = new LocalVectorStore()

function formatRecentHistory(history: ChatWorkflowContext['history']) {
  return history
    .slice(-6)
    .map(message => `${message.role}: ${message.content}`)
    .join('\n')
}

function formatPlanningKnowledgePreview(preview: Array<{ score: number, text: string }>) {
  if (preview.length === 0) {
    return ''
  }

  return preview
    .map((item, index) => `片段 ${index + 1}（score=${item.score.toFixed(3)}）:\n${item.text}`)
    .join('\n\n')
}

function formatToolCatalog() {
  return CHAT_TOOLS.map((tool) => {
    const parameterNames = Object.keys((tool.function.parameters.properties ?? {}) as Record<string, unknown>)
    const parameterText = parameterNames.length > 0 ? `参数：${parameterNames.join('、')}` : '参数：无'
    return `- ${tool.function.name}: ${tool.function.description} ${parameterText}`
  }).join('\n')
}

function buildPlannerMessages(
  context: ChatWorkflowContext,
  planningKnowledgePreview: string,
) {
  return buildPrompt({
    role: 'planner',
    userMessage: context.userMessage,
    iteration: context.iteration,
    maxIterations: context.maxIterations,
    memory: buildPromptBlock('用户长期记忆：', context.userContext),
    conversationSummary: buildPromptBlock('历史摘要：', context.conversationSummary),
    recentHistory: buildPromptBlock('最近对话：', formatRecentHistory(context.history)),
    planningKnowledgePreview: buildPromptBlock('RAG 背景预览：', planningKnowledgePreview),
    lastResult: buildPromptBlock('上一轮候选结果：', context.lastResult),
    feedback: buildPromptBlock('上一轮失败原因与修正建议：', context.feedback),
    tools: buildPromptBlock('可用工具目录：', formatToolCatalog()),
  })
}

function buildGenericFinalPrompt() {
  return '基于原始用户问题、可用上下文和前置步骤结果，输出直接给用户的最终结果。如果信息不足，请明确说明限制，不要编造。'
}

function buildToolFallbackPlan(userMessage: string): AgentPlanTask[] | null {
  const trimmedMessage = userMessage.trim()
  const normalizedMessage = trimmedMessage.replace(/[=＝]\s*\?*$/, '').trim()
  const expressionMatch = normalizedMessage.match(/([0-9+\-*/().%\s×÷]{3,})/)

  if (/天气|气温|温度|下雨|降雨|风力|weather/i.test(trimmedMessage)) {
    const locationMatch = trimmedMessage.match(/([\u4E00-\u9FFFa-z\s-]{2,30})现在?的?天气/i)
    const location = locationMatch?.[1]?.trim() || trimmedMessage

    return [
      {
        id: 'lookup_weather',
        title: '查询天气',
        tool: 'TOOL',
        dependsOn: [],
        parameters: {
          name: 'get_weather',
          arguments: { location },
        },
      },
      {
        id: 'final_answer',
        title: '输出最终回答',
        tool: 'LLM',
        dependsOn: ['lookup_weather'],
        parameters: {
          prompt: buildGenericFinalPrompt(),
          temperature: 0.2,
        },
      },
    ]
  }

  if (/几点|时间|日期|星期|time|date/i.test(trimmedMessage)) {
    return [
      {
        id: 'lookup_time',
        title: '查询时间',
        tool: 'TOOL',
        dependsOn: [],
        parameters: {
          name: 'get_time',
          arguments: {
            timezone: 'Asia/Shanghai',
            locale: 'zh-CN',
          },
        },
      },
      {
        id: 'final_answer',
        title: '输出最终回答',
        tool: 'LLM',
        dependsOn: ['lookup_time'],
        parameters: {
          prompt: buildGenericFinalPrompt(),
          temperature: 0.2,
        },
      },
    ]
  }

  if ((/计算|等于多少|是多少|[+\-*/×÷]/.test(trimmedMessage)) && expressionMatch?.[1]) {
    return [
      {
        id: 'run_calculation',
        title: '执行计算',
        tool: 'TOOL',
        dependsOn: [],
        parameters: {
          name: 'calculate_expression',
          arguments: {
            expression: expressionMatch[1].trim(),
          },
        },
      },
      {
        id: 'final_answer',
        title: '输出最终回答',
        tool: 'LLM',
        dependsOn: ['run_calculation'],
        parameters: {
          prompt: buildGenericFinalPrompt(),
          temperature: 0.1,
        },
      },
    ]
  }

  return null
}

function buildFallbackPlan(userMessage: string): AgentPlanTask[] {
  const toolPlan = buildToolFallbackPlan(userMessage)

  if (toolPlan) {
    return toolPlan
  }

  if (/博客|文章|教程|写一篇|写篇|技术文|大纲|总结/.test(userMessage)) {
    return [
      {
        id: 'search_knowledge',
        title: '检索相关知识',
        tool: 'RAG',
        dependsOn: [],
        parameters: {
          query: userMessage,
          topK: DEFAULT_RAG_TOP_K,
        },
      },
      {
        id: 'extract_key_points',
        title: '提炼写作要点',
        tool: 'LLM',
        dependsOn: ['search_knowledge'],
        parameters: {
          prompt: '根据检索结果提炼当前任务最重要的知识点、结构建议和必须覆盖的技术细节。',
          temperature: 0.1,
        },
      },
      {
        id: 'final_answer',
        title: '输出最终内容',
        tool: 'LLM',
        dependsOn: ['search_knowledge', 'extract_key_points'],
        parameters: {
          prompt: '基于前置步骤结果输出完整内容，确保结构清晰、信息自洽，并尽量加入具体示例。',
          temperature: 0.3,
        },
      },
    ]
  }

  return [
    {
      id: 'search_knowledge',
      title: '检索相关知识',
      tool: 'RAG',
      dependsOn: [],
      parameters: {
        query: userMessage,
        topK: DEFAULT_RAG_TOP_K,
      },
    },
    {
      id: 'final_answer',
      title: '输出最终回答',
      tool: 'LLM',
      dependsOn: ['search_knowledge'],
      parameters: {
        prompt: buildGenericFinalPrompt(),
        temperature: 0.2,
      },
    },
  ]
}

export async function planChatTasks(context: ChatWorkflowContext) {
  try {
    let planningKnowledgePreview = ''

    try {
      const { vector } = await generateQianwenEmbedding(context.userMessage)
      const previewResults = await planningVectorStore.search(vector, 2)
      planningKnowledgePreview = formatPlanningKnowledgePreview(previewResults)
    }
    catch (error) {
      console.error('Failed to build planner RAG preview:', error)
    }

    const completion = await llm.generate({
      model: context.model,
      messages: buildPlannerMessages(context, planningKnowledgePreview),
      temperature: 0.1,
    })

    try {
      const plan = parseAgentPlan(completion.content)
      return {
        tasks: plan.tasks,
        usage: completion.usage,
      }
    }
    catch (error) {
      console.error('Failed to parse planner output, using fallback plan:', error)
      return {
        tasks: buildFallbackPlan(context.userMessage),
        usage: completion.usage,
      }
    }
  }
  catch (error) {
    console.error('Failed to generate planner output, using fallback plan:', error)
    return {
      tasks: buildFallbackPlan(context.userMessage),
      usage: EMPTY_USAGE,
    }
  }
}
