export type LLMProviderName = 'qwen'

export interface LLMToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

export interface LLMToolDefinition {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  name?: string
  tool_call_id?: string
  tool_calls?: LLMToolCall[]
}

export interface LLMUsage {
  prompt: number
  completion: number
  total: number
}

export interface GenerateLLMParams {
  model: string
  messages: LLMMessage[]
  tools?: LLMToolDefinition[]
  temperature?: number
}

export interface GenerateLLMProviderParams {
  providerModel: string
  messages: LLMMessage[]
  tools?: LLMToolDefinition[]
  temperature?: number
}

export interface LLMResult {
  content: string
  toolCalls: LLMToolCall[]
  usage: LLMUsage
  latency: number
  provider: LLMProviderName
}

export type LLMStreamEvent
  = | { type: 'text', content: string }
    | { type: 'done', result: LLMResult }

export interface LLMProvider {
  generate: (params: GenerateLLMProviderParams) => Promise<LLMResult>
  generateStream?: (params: GenerateLLMProviderParams) => AsyncGenerator<LLMStreamEvent>
}
