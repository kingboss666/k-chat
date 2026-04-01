'use client'

import type { ChatMessage } from './chat/chat-types'
import type { ChatModelKey } from '@/src/lib/llm/models'
import { useMemo, useState } from 'react'
import { CHAT_MODEL_OPTIONS, FALLBACK_CHAT_MODEL, isSupportedChatModel } from '@/src/lib/llm/models'
import { cn } from '@/src/utils'
import { useChatStream } from './chat/hooks/useChatStream'
import { useTokenUsage } from './chat/hooks/useTokenUsage'
import { MessageList } from './chat/message-list'
import { TokenPanel } from './chat/token-panel'

interface ChatProps {
  defaultModel: string
}

function resolveInitialModel(defaultModel: string): ChatModelKey {
  if (isSupportedChatModel(defaultModel)) {
    return defaultModel
  }

  return FALLBACK_CHAT_MODEL
}

const Chat: React.FC<ChatProps> = ({ defaultModel }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [inputValue, setInputValue] = useState('')
  const [selectedModel, setSelectedModel] = useState<ChatModelKey>(() => resolveInitialModel(defaultModel))
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [isTokenChartVisible, setIsTokenChartVisible] = useState(false)

  const canSubmit = useMemo(() => {
    return inputValue.trim().length > 0 && !isLoading
  }, [inputValue, isLoading])

  const {
    tokenUsageStats,
    appendTokenUsageStat,
    formatDuration,
    formatNullableDuration,
    formatNullableNumber,
    estimateTokenCount,
  } = useTokenUsage()

  const { sendMessage, abort } = useChatStream({
    inputValue,
    selectedModel,
    canSubmit,
    estimateTokenCount,
    appendTokenUsageStat,
    onMessagesChange: setMessages,
    onInputValueChange: setInputValue,
    onError: setErrorMessage,
    onLoadingChange: setIsLoading,
  })

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(event.target.value)
  }

  const handleModelChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const nextModel = event.target.value

    if (!isSupportedChatModel(nextModel)) {
      return
    }

    setSelectedModel(nextModel)
  }

  const handleToggleTokenChart = () => {
    setIsTokenChartVisible(previous => !previous)
  }

  const handleReasoningToggle = (messageId: string) => {
    setMessages((previousMessages) => {
      return previousMessages.map((message) => {
        if (message.id !== messageId || message.role !== 'assistant' || !message.reasoning) {
          return message
        }

        return {
          ...message,
          isReasoningExpanded: !message.isReasoningExpanded,
        }
      })
    })
  }

  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') {
      return
    }

    event.preventDefault()
    void sendMessage()
  }

  const handleButtonClick = () => {
    if (isLoading) {
      abort()
      return
    }

    void sendMessage()
  }

  const activeModel = CHAT_MODEL_OPTIONS.find(option => option.value === selectedModel) ?? CHAT_MODEL_OPTIONS[0]

  return (
    <>
      <section
        className="flex h-[calc(100vh-12rem)] flex-col rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-xl shadow-slate-200/70 backdrop-blur"
        aria-label="聊天面板"
      >
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2.5">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Model</p>
            <p className="text-sm font-medium text-slate-800">{activeModel.label}</p>
            <p className="text-xs text-slate-500">{activeModel.description}</p>
          </div>

          <label className="ml-auto flex min-w-52 flex-col gap-1 text-xs text-slate-500" htmlFor="chat-model">
            <span>切换当前对话模型</span>
            <select
              id="chat-model"
              value={selectedModel}
              onChange={handleModelChange}
              disabled={isLoading}
              className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-200 disabled:cursor-not-allowed disabled:bg-slate-100"
            >
              {CHAT_MODEL_OPTIONS.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mb-4 min-h-0 flex-1 rounded-xl border border-slate-200 bg-slate-50/80 p-3">
          <MessageList messages={messages} onReasoningToggle={handleReasoningToggle} />
        </div>

        <div className="flex gap-2">
          <input
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleInputKeyDown}
            placeholder="输入消息..."
            className="h-10 flex-1 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-200"
            aria-label="输入消息"
            tabIndex={0}
          />
          <button
            type="button"
            onClick={handleButtonClick}
            disabled={!isLoading && !canSubmit}
            className={cn(
              'h-10 rounded-xl px-4 text-sm font-medium text-white shadow-sm transition-colors disabled:cursor-not-allowed',
              isLoading
                ? 'bg-red-500 hover:bg-red-400'
                : 'bg-blue-500 hover:bg-blue-400 disabled:bg-slate-300',
            )}
            aria-label={isLoading ? '终止生成' : '发送消息'}
            tabIndex={0}
          >
            {isLoading ? '终止' : '发送'}
          </button>
        </div>

        {errorMessage ? <p className="mt-2 text-sm text-red-500">{errorMessage}</p> : null}
      </section>

      <TokenPanel
        isVisible={isTokenChartVisible}
        onToggle={handleToggleTokenChart}
        tokenUsageStats={tokenUsageStats}
        formatDuration={formatDuration}
        formatNullableDuration={formatNullableDuration}
        formatNullableNumber={formatNullableNumber}
      />
    </>
  )
}

export default Chat
