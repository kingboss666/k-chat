import type { ChatMessage } from './chat-types'
import { useEffect, useRef } from 'react'
import { cn } from '@/src/utils'

interface MessageListProps {
  messages: ChatMessage[]
  onReasoningToggle: (messageId: string) => void
}

function normalizeMessageContent(content: string) {
  return content.replace(/\\n/g, '\n')
}

const MessageList: React.FC<MessageListProps> = ({ messages, onReasoningToggle }) => {
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  if (messages.length === 0) {
    return (
      <p className="text-sm text-slate-500">输入内容后回车或点击发送</p>
    )
  }

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto pr-2">
      {messages.map(message => (
        <article
          key={message.id}
          className={cn(
            'min-h-[36px] max-w-[80%] shrink-0 rounded-xl px-3 py-2 text-sm shadow-sm',
            message.role === 'user'
              ? 'ml-auto bg-blue-500 text-white'
              : 'mr-auto border border-slate-200 bg-white text-slate-800',
          )}
          aria-label={message.role === 'user' ? '用户消息' : '助手消息'}
          tabIndex={0}
        >
          {message.role === 'assistant' && message.reasoning
            ? (
                <div className="mb-2 border-b border-slate-100 pb-2">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between rounded-lg px-2 py-1 text-left text-xs text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700"
                    onClick={() => onReasoningToggle(message.id)}
                    aria-expanded={message.isReasoningExpanded}
                  >
                    <span>思路摘要</span>
                    <span className={cn('transition-transform', message.isReasoningExpanded ? 'rotate-180' : '')}>
                      ˅
                    </span>
                  </button>

                  {message.isReasoningExpanded
                    ? (
                        <div className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                          <p className="whitespace-pre-wrap">{message.reasoning}</p>
                        </div>
                      )
                    : null}
                </div>
              )
            : null}

          <div className="whitespace-pre-wrap">
            {normalizeMessageContent(message.content)}
          </div>
        </article>
      ))}
      <div ref={messagesEndRef} />
    </div>
  )
}

export { MessageList }
