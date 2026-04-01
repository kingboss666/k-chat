import type { LLMToolDefinition } from '@/src/lib/llm'

export const MAX_TOOL_ROUNDS = 4
export const DEFAULT_RAG_TOP_K = 3
export const MAX_CHAT_ITERATIONS = 3

export const EMPTY_USAGE = {
  prompt: 0,
  completion: 0,
  total: 0,
}

// 聊天场景当前支持的工具定义，后续扩展工具时优先在这里集中维护。
export const CHAT_TOOLS: LLMToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'get_weather',
      description: '查询指定城市或地区的当前天气信息，返回温度、体感温度、湿度、风速和天气描述。',
      parameters: {
        type: 'object',
        properties: {
          location: {
            type: 'string',
            description: '用户想查询天气的城市或地区，例如 北京、上海、Tokyo。',
          },
        },
        required: ['location'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_time',
      description: '查询当前时间或日期。若用户指定地区，请优先传入对应 IANA 时区，例如 Asia/Shanghai、America/New_York。',
      parameters: {
        type: 'object',
        properties: {
          timezone: {
            type: 'string',
            description: 'IANA 时区名，例如 Asia/Shanghai。',
          },
          locale: {
            type: 'string',
            description: '日期时间格式化语言环境，例如 zh-CN、en-US。',
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'calculate_expression',
      description: '计算简单数学表达式，例如 23 * (7 + 5) / 2。',
      parameters: {
        type: 'object',
        properties: {
          expression: {
            type: 'string',
            description: '只包含数字、括号、小数点以及 + - * / % 的数学表达式。',
          },
        },
        required: ['expression'],
        additionalProperties: false,
      },
    },
  },
]
