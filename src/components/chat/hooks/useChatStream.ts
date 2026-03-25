import type {
  ChatApiResponse,
  ChatMessage,
  ChatStreamEvent,
  ChatStreamUsage,
} from '../chat-types'
import type { AppendTokenUsageParams } from './useTokenUsage'
import { useCallback, useRef } from 'react'

interface SendMessageArgs {
  inputValue: string
  canSubmit: boolean
  estimateTokenCount: (text: string) => number
  appendTokenUsageStat: (params: AppendTokenUsageParams) => void
  onMessagesChange: (updater: (previous: ChatMessage[]) => ChatMessage[]) => void
  onInputValueChange: (value: string) => void
  onError: (message: string) => void
  onLoadingChange: (isLoading: boolean) => void
}

function useChatStream({
  inputValue,
  canSubmit,
  estimateTokenCount,
  appendTokenUsageStat,
  onMessagesChange,
  onInputValueChange,
  onError,
  onLoadingChange,
}: SendMessageArgs) {
  const messageIdRef = useRef(0)
  const abortControllerRef = useRef<AbortController | null>(null)

  const createMessageId = useCallback(() => {
    messageIdRef.current += 1
    return `${Date.now()}-${messageIdRef.current}`
  }, [])

  const appendReasoningLine = useCallback((currentReasoning: string, nextLine: string) => {
    const normalizedLine = nextLine.trim()
    if (!normalizedLine) {
      return currentReasoning
    }

    if (!currentReasoning.trim()) {
      return normalizedLine
    }

    const existingLines = currentReasoning.split('\n').map(line => line.trim())
    if (existingLines.includes(normalizedLine)) {
      return currentReasoning
    }

    return `${currentReasoning}\n${normalizedLine}`
  }, [])

  const sendMessage = useCallback(async () => {
    if (!canSubmit) {
      return
    }

    const userMessage: ChatMessage = {
      id: createMessageId(),
      role: 'user',
      content: inputValue.trim(),
    }

    onMessagesChange(previousMessages => [
      ...previousMessages,
      userMessage,
      {
        id: createMessageId(),
        role: 'assistant',
        content: '',
        reasoning: '',
        isThinking: true,
        isReasoningExpanded: true,
      },
    ])
    onInputValueChange('')
    onError('')
    onLoadingChange(true)

    let requestStartedAt: number | null = null
    let firstTokenAt: number | null = null
    let streamUsage: ChatStreamUsage | null = null
    let assistantContent = ''
    let reasoning = ''
    const estimatedPromptTokens = estimateTokenCount(userMessage.content)

    try {
      const abortController = new AbortController()
      abortControllerRef.current = abortController
      requestStartedAt = performance.now()
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: userMessage.content,
        }),
        signal: abortController.signal,
      })

      if (!response.ok || !response.body) {
        const rawError = await response.text()
        let parsedError = '发送失败，请稍后重试'

        if (rawError) {
          try {
            const payload = JSON.parse(rawError) as ChatApiResponse
            parsedError = payload.error ?? parsedError
          }
          catch {
            parsedError = rawError
          }
        }

        onMessagesChange(previousMessages => previousMessages.slice(0, -1))
        onError(parsedError)
        return
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let streamBuffer = ''

      const handleStreamLine = (rawLine: string) => {
        const line = rawLine.trim()
        if (!line) {
          return
        }

        try {
          const event = JSON.parse(line) as ChatStreamEvent
          if (event.type === 'text' && event.content) {
            if (firstTokenAt === null) {
              firstTokenAt = performance.now()
            }
            assistantContent += event.content
          }
          if (event.type === 'reasoning' && event.content) {
            reasoning = appendReasoningLine(reasoning, event.content)
          }
          if (event.type === 'usage') {
            streamUsage = event.usage
          }
          if (event.type === 'error') {
            throw new Error(event.error || '请求失败，请检查服务状态')
          }
        }
        catch (error) {
          if (error instanceof SyntaxError) {
            return
          }

          if (error instanceof Error) {
            throw error
          }
          // Ignore malformed lines to keep the stream alive.
        }
      }

      const syncAssistantMessage = () => {
        onMessagesChange((previousMessages) => {
          const nextMessages = [...previousMessages]
          const lastIndex = nextMessages.length - 1

          if (lastIndex >= 0 && nextMessages[lastIndex].role === 'assistant') {
            nextMessages[lastIndex] = {
              ...nextMessages[lastIndex],
              content: assistantContent,
              reasoning,
              isThinking: true,
              isReasoningExpanded: reasoning ? true : nextMessages[lastIndex].isReasoningExpanded,
            }
          }

          return nextMessages
        })
      }

      while (true) {
        const { done, value } = await reader.read()
        if (done) {
          streamBuffer += decoder.decode()
          break
        }

        streamBuffer += decoder.decode(value, { stream: true })
        const lines = streamBuffer.split('\n')
        streamBuffer = lines.pop() ?? ''
        lines.forEach(handleStreamLine)
        syncAssistantMessage()
      }

      if (streamBuffer.trim()) {
        handleStreamLine(streamBuffer)
      }

      syncAssistantMessage()

      onMessagesChange((previousMessages) => {
        const nextMessages = [...previousMessages]
        const lastIndex = nextMessages.length - 1

        if (lastIndex >= 0 && nextMessages[lastIndex].role === 'assistant') {
          nextMessages[lastIndex] = {
            ...nextMessages[lastIndex],
            reasoning,
            isThinking: false,
            isReasoningExpanded: false,
          }
        }

        return nextMessages
      })

      appendTokenUsageStat({
        usage: streamUsage,
        requestStartedAt,
        firstTokenAt,
        isAborted: false,
        fallbackPromptTokens: estimatedPromptTokens,
        fallbackCompletionTokens: estimateTokenCount(assistantContent),
      })
    }
    catch (error: unknown) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        onMessagesChange((previousMessages) => {
          const nextMessages = [...previousMessages]
          const lastIndex = nextMessages.length - 1
          if (lastIndex < 0 || nextMessages[lastIndex].role !== 'assistant') {
            return nextMessages
          }

          if (!nextMessages[lastIndex].content.trim()) {
            return nextMessages.slice(0, -1)
          }

          nextMessages[lastIndex] = {
            ...nextMessages[lastIndex],
            reasoning,
            isThinking: false,
            isReasoningExpanded: false,
          }

          return nextMessages
        })
        appendTokenUsageStat({
          usage: streamUsage,
          requestStartedAt,
          firstTokenAt,
          isAborted: true,
          fallbackPromptTokens: estimatedPromptTokens,
          fallbackCompletionTokens: estimateTokenCount(assistantContent),
        })
        onError('已终止生成')
        return
      }

      onMessagesChange((previousMessages) => {
        if (!assistantContent.trim()) {
          return previousMessages.slice(0, -1)
        }

        const nextMessages = [...previousMessages]
        const lastIndex = nextMessages.length - 1

        if (lastIndex >= 0 && nextMessages[lastIndex].role === 'assistant') {
          nextMessages[lastIndex] = {
            ...nextMessages[lastIndex],
            reasoning,
            isThinking: false,
            isReasoningExpanded: false,
          }
        }

        return nextMessages
      })
      onError(error instanceof Error ? error.message : '请求失败，请检查服务状态')
    }
    finally {
      onLoadingChange(false)
      abortControllerRef.current = null
    }
  }, [
    appendTokenUsageStat,
    appendReasoningLine,
    canSubmit,
    createMessageId,
    estimateTokenCount,
    inputValue,
    onError,
    onInputValueChange,
    onLoadingChange,
    onMessagesChange,
  ])

  const abort = useCallback(() => {
    abortControllerRef.current?.abort()
  }, [])

  return {
    sendMessage,
    abort,
  }
}

export { useChatStream }
