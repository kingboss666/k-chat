'use client'

import type { ChatMessage } from './chat/chat-types'
import { useMemo, useState } from 'react'
import { cn } from '@/src/lib/utils'
import { useChatStream } from './chat/hooks/useChatStream'
import { useTokenUsage } from './chat/hooks/useTokenUsage'
import { MessageList } from './chat/message-list'
import { TokenPanel } from './chat/token-panel'

const Chat: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [inputValue, setInputValue] = useState('')
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
    messages,
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

  const handleToggleTokenChart = () => {
    setIsTokenChartVisible(previous => !previous)
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

  return (
    <>
      <section
        className="flex h-[calc(100vh-12rem)] flex-col rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-xl shadow-slate-200/70 backdrop-blur"
        aria-label="聊天面板"
      >
        <div className="mb-4 min-h-0 flex-1 rounded-xl border border-slate-200 bg-slate-50/80 p-3">
          <MessageList messages={messages} />
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
