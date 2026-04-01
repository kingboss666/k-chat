import type {
  GenerateLLMParams,
  GenerateLLMProviderParams,
  LLMProvider,
  LLMProviderName,
  LLMResult,
  LLMStreamEvent,
} from './types'
import { qwenProvider } from '@/src/lib/qianwen'
import { FALLBACK_CHAT_MODEL, isSupportedChatModel } from './models'

interface RegisteredModel {
  provider: LLMProviderName
  providerModel: string
}

const DEFAULT_QWEN_MODEL = process.env.QWEN_MODEL ?? process.env.QIANWEN_MODEL ?? 'qwen-plus-2025-07-28'

const MODEL_REGISTRY: Record<string, RegisteredModel> = {
  'qwen': {
    provider: 'qwen',
    providerModel: DEFAULT_QWEN_MODEL,
  },
  'qwen-plus': {
    provider: 'qwen',
    providerModel: process.env.QWEN_PLUS_MODEL ?? 'qwen-plus-2025-07-28',
  },
  'qwen-max': {
    provider: 'qwen',
    providerModel: process.env.QWEN_MAX_MODEL ?? 'qwen-max-latest',
  },
  'qwen-turbo': {
    provider: 'qwen',
    providerModel: process.env.QWEN_TURBO_MODEL ?? 'qwen-turbo-latest',
  },
}

const PROVIDERS: Record<LLMProviderName, LLMProvider> = {
  qwen: qwenProvider,
}

function resolveRegisteredModel(model: string): RegisteredModel {
  const resolvedModel = MODEL_REGISTRY[model]

  if (!resolvedModel) {
    throw new Error(`UNKNOWN_LLM_MODEL: ${model}`)
  }

  return resolvedModel
}

function buildProviderParams(params: GenerateLLMParams): {
  provider: LLMProvider
  providerParams: GenerateLLMProviderParams
} {
  const { model, ...rest } = params
  const resolvedModel = resolveRegisteredModel(model)
  const provider = PROVIDERS[resolvedModel.provider]

  return {
    provider,
    providerParams: {
      ...rest,
      providerModel: resolvedModel.providerModel,
    },
  }
}

const configuredDefaultChatModel = process.env.DEFAULT_CHAT_MODEL ?? FALLBACK_CHAT_MODEL

export const DEFAULT_CHAT_MODEL = isSupportedChatModel(configuredDefaultChatModel)
  ? configuredDefaultChatModel
  : FALLBACK_CHAT_MODEL

export const llm = {
  async generate(params: GenerateLLMParams): Promise<LLMResult> {
    const { provider, providerParams } = buildProviderParams(params)
    return provider.generate(providerParams)
  },

  async *generateStream(params: GenerateLLMParams): AsyncGenerator<LLMStreamEvent> {
    const { provider, providerParams } = buildProviderParams(params)

    if (provider.generateStream) {
      yield * provider.generateStream(providerParams)
      return
    }

    const result = await provider.generate(providerParams)

    for (const char of result.content) {
      yield { type: 'text', content: char }
    }

    yield {
      type: 'done',
      result,
    }
  },
}

export type {
  GenerateLLMParams,
  GenerateLLMProviderParams,
  LLMMessage,
  LLMProvider,
  LLMProviderName,
  LLMResult,
  LLMStreamEvent,
  LLMToolCall,
  LLMToolDefinition,
  LLMUsage,
} from './types'
