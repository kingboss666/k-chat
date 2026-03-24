function normalizeReasoningText(reasoning: string) {
  const normalized = reasoning.replace(/\s+/g, ' ').trim()
  if (!normalized) {
    return ''
  }

  const segments = normalized
    .split(/[。！？.!?\n]/)
    .map(segment => segment.trim())
    .filter(Boolean)

  const currentSegment = segments.at(-1) ?? normalized
  return currentSegment.length > 48 ? `${currentSegment.slice(0, 48)}...` : currentSegment
}

export function buildSystemPrompt() {
  return [
    '你是一个具备工具调用能力的中文助理。',
    '当用户询问天气、时间/日期、简单计算时，你必须优先调用工具获取结果，禁止凭记忆直接回答或猜测。',
    '天气相关问题必须调用 get_weather。',
    '当前时间、日期、星期、某地现在几点等问题必须调用 get_time。',
    '四则运算、括号表达式、简单数学题必须调用 calculate_expression。',
    '如果工具执行失败或结果不完整，要明确告诉用户，不得编造。',
    '如果用户没有提供足够信息，例如只问“天气怎么样”，可以先简短追问地点。',
    '如果系统提供了知识库上下文，你必须优先基于知识库回答；知识库没有明确提到时，要明确说知识库中没有提供这个信息，不要猜测。',
    '最终回答保持简洁、准确、自然，优先用中文回答。',
    `你必须遵循以下格式回答：'Thought: 你当前的一句简短思考，只保留当前在做什么，不要展开过多细节。Final Answer: 给用户的最终回答。'`,
  ].join('\n')
}

export function stripStructuredLabels(text: string) {
  return text
    .replace(/^\s*(?:\*+\s*)?Thought\s*[:：]\s*/i, '')
    .replace(/^\s*(?:\*+\s*)?Final\s*Answer\s*[:：]\s*/i, '')
    .replace(/^\s*(?:\*+\s*)?Final\s*Answe?\s*[:：]?\s*/i, '')
    .replace(/^\s*(?:\*+\s*)?Final\s*Answ?\s*[:：]?\s*/i, '')
    .replace(/^\s*(?:\*+\s*)?Final\s*Ans?\s*[:：]?\s*/i, '')
    .replace(/^\s*(?:\*+\s*)?Final\s*A?\s*[:：]?\s*/i, '')
    .trimStart()
}

function findFirstLabelIndex(content: string, labels: string[]) {
  const normalizedContent = content.toLowerCase()
  const indexes = labels
    .map(label => normalizedContent.indexOf(label))
    .filter(index => index >= 0)

  if (indexes.length === 0) {
    return -1
  }

  return Math.min(...indexes)
}

export function parseStructuredAssistantOutput(rawContent: string) {
  const thoughtLabels = ['thought:', 'thought：', '**thought:**', '**thought：**']
  const finalAnswerLabels = ['final answer:', 'final answer：', '**final answer:**', '**final answer：**']
  const thoughtIndex = findFirstLabelIndex(rawContent, thoughtLabels)

  if (thoughtIndex === -1) {
    return {
      reasoning: '',
      answer: '',
      hasFinalAnswer: false,
    }
  }

  const afterThought = rawContent.slice(thoughtIndex)
  const thoughtLabel = thoughtLabels.find(label => afterThought.toLowerCase().startsWith(label)) ?? 'thought:'
  const thoughtContent = afterThought.slice(thoughtLabel.length)
  const finalAnswerRelativeIndex = findFirstLabelIndex(thoughtContent, finalAnswerLabels)

  if (finalAnswerRelativeIndex === -1) {
    return {
      reasoning: normalizeReasoningText(thoughtContent),
      answer: '',
      hasFinalAnswer: false,
    }
  }

  const reasoningText = thoughtContent.slice(0, finalAnswerRelativeIndex)
  const finalAnswerSection = thoughtContent.slice(finalAnswerRelativeIndex)
  const finalAnswerLabel = finalAnswerLabels.find(label => finalAnswerSection.toLowerCase().startsWith(label)) ?? 'final answer:'

  return {
    reasoning: normalizeReasoningText(reasoningText),
    answer: stripStructuredLabels(finalAnswerSection.slice(finalAnswerLabel.length)),
    hasFinalAnswer: true,
  }
}
