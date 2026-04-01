const CHAT_MODEL_OPTIONS = [
  {
    value: 'qwen',
    label: 'Qwen Default',
    description: '使用当前默认映射的千问模型。',
  },
  {
    value: 'qwen-plus',
    label: 'Qwen Plus',
    description: '平衡质量、速度和成本。',
  },
  {
    value: 'qwen-max',
    label: 'Qwen Max',
    description: '更强的推理和生成质量。',
  },
  {
    value: 'qwen-turbo',
    label: 'Qwen Turbo',
    description: '优先速度和成本效率。',
  },
] as const

type ChatModelKey = (typeof CHAT_MODEL_OPTIONS)[number]['value']

const CHAT_MODEL_SET = new Set<string>(CHAT_MODEL_OPTIONS.map(model => model.value))

const FALLBACK_CHAT_MODEL: ChatModelKey = 'qwen'

function isSupportedChatModel(model: string): model is ChatModelKey {
  return CHAT_MODEL_SET.has(model)
}

export {
  CHAT_MODEL_OPTIONS,
  FALLBACK_CHAT_MODEL,
  isSupportedChatModel,
}

export type { ChatModelKey }
