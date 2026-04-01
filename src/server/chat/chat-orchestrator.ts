import { DEFAULT_CHAT_MODEL } from '@/src/lib/llm'
import { createChatAgent } from './chat-agent'

// 协调层退化成轻入口：真正的 Agent 循环已经收敛到通用引擎里。
export function generateChatStream(userMessage: string, model = DEFAULT_CHAT_MODEL) {
  return createChatAgent().run({
    userMessage,
    model,
  })
}
