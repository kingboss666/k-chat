import type { ChatMessage } from './chat-types'
import { useEffect, useRef } from 'react'
import { cn } from '@/src/lib/utils'

interface MessageListProps {
  messages: ChatMessage[]
}

function normalizeMessageContent(content: string) {
  return content.replace(/\\n/g, '\n')
}

const MessageList: React.FC<MessageListProps> = ({ messages }) => {
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
            'min-h-[36px] max-w-[80%] shrink-0 whitespace-pre-wrap rounded-xl px-3 py-2 text-sm shadow-sm',
            message.role === 'user'
              ? 'ml-auto bg-blue-500 text-white'
              : 'mr-auto border border-slate-200 bg-white text-slate-800',
          )}
          aria-label={message.role === 'user' ? '用户消息' : '助手消息'}
          tabIndex={0}
        >
          {normalizeMessageContent(message.content)}
        </article>
      ))}
      <div ref={messagesEndRef} />
    </div>
  )
}

export { MessageList }
