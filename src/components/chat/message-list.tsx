import type { ChatMessage } from './chat-types'
import { cn } from '@/src/lib/utils'

interface MessageListProps {
  messages: ChatMessage[]
}

function normalizeMessageContent(content: string) {
  return content.replace(/\\n/g, '\n')
}

const MessageList: React.FC<MessageListProps> = ({ messages }) => {
  if (messages.length === 0) {
    return (
      <p className="text-sm text-slate-500">输入内容后回车或点击发送</p>
    )
  }

  return (
    <>
      {messages.map(message => (
        <article
          key={message.id}
          className={cn(
            'max-w-[80%] whitespace-pre-wrap rounded-xl px-3 py-2 text-sm shadow-sm',
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
    </>
  )
}

export { MessageList }
