import type { LLMMessage } from '@/src/lib/llm'

export interface PromptChunk {
  text: string
}

type PromptScalar = string | number | boolean | null | undefined
export type PromptVariableValue =
  | PromptScalar
  | PromptVariableValue[]
  | { [key: string]: PromptVariableValue }

type PromptTemplateVariables = Record<string, PromptVariableValue>
type PromptMessageRole = LLMMessage['role']

interface PromptTemplateMessage {
  role: PromptMessageRole
  content: string | string[]
  name?: string
  tool_call_id?: string
}

type PromptTemplate = readonly PromptTemplateMessage[]

const PROMPT_TEMPLATES = {
  writer: [
    {
      role: 'system',
      content: [
        '你是一个高质量写作助手。',
        '优先利用给定上下文、长期记忆和工具结果，输出清晰、准确、结构自然的内容。',
        '{{systemInstruction}}',
      ],
    },
    {
      role: 'user',
      content: [
        '写作目标：{{input}}',
        '{{context}}',
        '{{memory}}',
        '{{tools}}',
      ],
    },
  ],
  summary: [
    {
      role: 'system',
      content: [
        '你是对话摘要助手。',
        '请总结关键信息，包括用户背景、讨论主题和重要结论。',
        '保持简洁，不超过 200 字。',
      ],
    },
    {
      role: 'user',
      content: '对话内容：\n{{conversationText}}',
    },
  ],
  rag: [
    {
      role: 'system',
      content: [
        'You must answer based on the following context.',
        'If the context is insufficient, explicitly say so.',
      ],
    },
    {
      role: 'user',
      content: [
        'Context:\n{{context}}',
        'Question:\n{{question}}',
      ],
    },
  ],
  planner: [
    {
      role: 'system',
      content: [
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
      ],
    },
    {
      role: 'user',
      content: [
        '用户目标：{{userMessage}}',
        '当前轮次：第 {{iteration}} / {{maxIterations}} 轮',
        '{{memory}}',
        '{{conversationSummary}}',
        '{{recentHistory}}',
        '{{planningKnowledgePreview}}',
        '{{lastResult}}',
        '{{feedback}}',
        '{{tools}}',
      ],
    },
  ],
  executor: [
    {
      role: 'system',
      content: [
        '你是 Executor Agent，负责执行当前单个任务步骤。',
        '只根据提供的用户问题、上下文和前置结果完成当前步骤。',
        '如果缺少必要信息，要明确说明限制，不要编造。',
        '{{executionModeInstruction}}',
        '{{systemPrompt}}',
      ],
    },
    {
      role: 'user',
      content: [
        '当前步骤：{{taskTitle}}',
        '原始用户问题：{{userMessage}}',
        '{{memory}}',
        '{{conversationSummary}}',
        '{{recentHistory}}',
        '{{dependencyResults}}',
        '执行要求：\n{{taskPrompt}}',
        '{{outputConstraint}}',
      ],
    },
  ],
  evaluator: [
    {
      role: 'system',
      content: [
        '你是 Evaluator Agent。',
        '你的职责是独立判断 currentResult 是否已经满足 userGoal。',
        '不要重写答案，不要补做实现，只做判断。',
        '如果 currentResult 已经直接、完整、准确地回应了 userGoal，则 success=true。',
        '如果仍然存在遗漏、偏题、信息不足或表达不清，则 success=false。',
        '当 success=false 时，nextAction 必须给出下一轮 Planner/Executor 可以直接执行的修正方向。',
        '当 success=true 时，nextAction 保持空字符串即可。',
        '必须输出 JSON，不允许额外解释。',
        '输出 schema:',
        '{"success":true,"reason":"简短说明","nextAction":""}',
      ],
    },
    {
      role: 'user',
      content: [
        'userGoal:\n{{userGoal}}',
        'currentResult:\n{{currentResult}}',
      ],
    },
  ],
  longTermMemory: [
    {
      role: 'system',
      content: [
        '请只根据用户消息，提取适合写入长期记忆的稳定用户信息。',
        '只记录跨会话仍然有价值的信息，例如用户身份、职业、长期兴趣、稳定偏好、背景事实。',
        '不要记录临时问题、一次性任务、当前时间、天气、短期计划。',
        '不要记录当前正在讨论的文章、故事、文档、示例、角色设定、虚构世界观，除非用户明确说那是他自己的真实信息。',
        '不要根据助手回复补充或猜测用户信息。',
        '返回 JSON，对象字段只能是 profession、interests、preferences。',
        'profession 用字符串；interests 用字符串数组；preferences 用 key-value 对象。',
        '如果没有新增信息，返回空对象 {}。',
        '不要输出 Markdown 代码块，不要额外解释。',
      ],
    },
    {
      role: 'user',
      content: [
        '当前长期记忆：{{currentProfile}}',
        '用户消息：{{userMessage}}',
      ],
    },
  ],
  toolResult: [
    {
      role: 'tool',
      name: '{{toolName}}',
      tool_call_id: '{{toolCallId}}',
      content: '{{toolResult}}',
    },
  ],
} as const satisfies Record<string, PromptTemplate>

export type PromptTemplateRole = keyof typeof PROMPT_TEMPLATES
export type BuildPromptParams<TRole extends PromptTemplateRole = PromptTemplateRole> = {
  role: TRole
} & PromptTemplateVariables

function isRecord(value: PromptVariableValue): value is Record<string, PromptVariableValue> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function serializePromptValue(value: PromptVariableValue): string {
  if (value == null) {
    return ''
  }

  if (typeof value === 'string') {
    return value.trim()
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }

  if (Array.isArray(value)) {
    return value
      .map(item => serializePromptValue(item))
      .filter(Boolean)
      .join('\n')
      .trim()
  }

  try {
    return JSON.stringify(value, null, 2)
  }
  catch {
    return String(value)
  }
}

function getPromptVariable(variables: PromptTemplateVariables, path: string): PromptVariableValue {
  const segments = path.split('.').filter(Boolean)
  let current: PromptVariableValue = variables

  for (const segment of segments) {
    if (!isRecord(current) || !(segment in current)) {
      return ''
    }

    current = current[segment]
  }

  return current
}

function normalizePromptText(content: string) {
  return content
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function injectPromptVariables(template: string, variables: PromptTemplateVariables) {
  return normalizePromptText(
    template.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_, path: string) => serializePromptValue(getPromptVariable(variables, path))),
  )
}

function renderPromptContent(content: string | string[], variables: PromptTemplateVariables) {
  if (Array.isArray(content)) {
    return content
      .map(part => injectPromptVariables(part, variables))
      .filter(Boolean)
      .join('\n\n')
  }

  return injectPromptVariables(content, variables)
}

export function buildPrompt<TRole extends PromptTemplateRole>({
  role,
  ...variables
}: BuildPromptParams<TRole>): LLMMessage[] {
  const template: PromptTemplate = PROMPT_TEMPLATES[role]

  return template.flatMap((message) => {
    const content = renderPromptContent(message.content, variables)
    if (!content) {
      return []
    }

    const nameTemplate = 'name' in message ? message.name : undefined
    const toolCallIdTemplate = 'tool_call_id' in message ? message.tool_call_id : undefined
    const name = nameTemplate ? injectPromptVariables(nameTemplate, variables) : undefined
    const toolCallId = toolCallIdTemplate ? injectPromptVariables(toolCallIdTemplate, variables) : undefined

    return [{
      role: message.role,
      content,
      ...(name ? { name } : {}),
      ...(toolCallId ? { tool_call_id: toolCallId } : {}),
    }]
  })
}

export function buildPromptBlock(title: string, content: PromptVariableValue) {
  const normalizedContent = serializePromptValue(content)
  return normalizedContent ? `${title}\n${normalizedContent}` : ''
}

export function serializePromptMessages(messages: LLMMessage[]) {
  return messages
    .map((message) => {
      const meta = [
        message.role,
        message.name ? `name=${message.name}` : '',
        message.tool_call_id ? `tool_call_id=${message.tool_call_id}` : '',
      ].filter(Boolean).join(' ')

      return normalizePromptText(`${meta}:\n${message.content ?? ''}`)
    })
    .join('\n\n')
}

export interface BuildRagPromptParams {
  question: string
  chunks: PromptChunk[]
}

export function buildRagPrompt({ question, chunks }: BuildRagPromptParams) {
  const normalizedQuestion = question.trim()
  const normalizedChunks = chunks
    .map(chunk => chunk.text.trim())
    .filter(Boolean)

  const context = normalizedChunks.length > 0
    ? normalizedChunks.join('\n')
    : 'No relevant context found.'

  return serializePromptMessages(buildPrompt({
    role: 'rag',
    question: normalizedQuestion,
    context,
  }))
}
