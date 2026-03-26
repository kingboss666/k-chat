import type { AgentPlanTask } from '@/src/lib/agent-planning'
import type { ChatWorkflowContext } from '@/src/lib/chat-workflow'
import { parseAgentPlan } from '@/src/lib/agent-planning'
import { generateQianwenChatCompletion, generateQianwenEmbedding } from '@/src/lib/qianwen'
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

function buildPlannerSystemPrompt() {
  return [
    '你是 AI Task Planner。',
    '你的任务是根据用户问题生成最小可执行任务列表。',
    'Rules:',
    '1. 根据用户问题生成步骤。',
    '2. 每步必须指定 tool。',
    '3. 步骤顺序合理，依赖必须通过 dependsOn 明确声明。',
    '4. 输出 JSON，不允许文本解释。',
    '5. tool 只能是 RAG、LLM、TOOL。',
    '6. TOOL.parameters.name 只能是 get_weather、get_time、calculate_expression。',
    '7. 最后一步必须是 LLM，并且用于输出直接给用户的最终结果。',
    '8. 尽量减少步骤，通常 2 到 5 步足够。',
    '9. 遇到天气、时间、计算类问题优先使用 TOOL。',
    '10. 遇到需要知识依据、文档、资料的问题时使用 RAG。',
    '11. 遇到写作类任务时，可以先检索资料，再提炼要点，再产出内容。',
    '12. parameters 必须可直接执行，禁止输出 TODO、占位符或“根据上下文自行决定”。',
    '13. 如果提供了上一轮 Evaluator 反馈，你必须优先修正这些问题。',
    '14. 如果提供了上一轮候选结果，你必须避免重复其中已经暴露的问题，必要时补充新的步骤。',
    '',
    '输出 schema:',
    '{"tasks":[{"id":"step_id","title":"步骤标题","tool":"RAG|LLM|TOOL","dependsOn":["prev_step"],"parameters":{}}]}',
    '',
    'RAG parameters:',
    '{"query":"检索词","topK":3}',
    '',
    'LLM parameters:',
    '{"prompt":"当前步骤要执行的指令","systemPrompt":"可选的系统约束","temperature":0.2}',
    '',
    'TOOL parameters:',
    '{"name":"get_weather|get_time|calculate_expression","arguments":{"key":"value"}}',
  ].join('\n')
}

function buildPlannerUserPrompt(
  context: ChatWorkflowContext,
  planningKnowledgePreview: string,
) {
  const recentHistory = formatRecentHistory(context.history)

  return [
    `用户目标：${context.userMessage}`,
    `当前轮次：第 ${context.iteration} / ${context.maxIterations} 轮`,
    context.userContext ? `用户长期记忆：\n${context.userContext}` : '',
    context.conversationSummary ? `历史摘要：\n${context.conversationSummary}` : '',
    recentHistory ? `最近对话：\n${recentHistory}` : '',
    planningKnowledgePreview ? `RAG 背景预览：\n${planningKnowledgePreview}` : '',
    context.lastResult ? `上一轮候选结果：\n${context.lastResult}` : '',
    context.feedback ? `上一轮失败原因与修正建议：\n${context.feedback}` : '',
    `可用工具目录：\n${formatToolCatalog()}`,
  ].filter(Boolean).join('\n\n')
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

    const completion = await generateQianwenChatCompletion({
      messages: [
        {
          role: 'system',
          content: buildPlannerSystemPrompt(),
        },
        {
          role: 'user',
          content: buildPlannerUserPrompt(context, planningKnowledgePreview),
        },
      ],
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
