export interface PromptChunk {
  text: string
}

export interface BuildRagPromptParams {
  question: string
  chunks: PromptChunk[]
}

export function buildRagPrompt({ question, chunks }: BuildRagPromptParams) {
  const normalizedQuestion = question.trim()
  const normalizedChunks = chunks
    .map(chunk => chunk.text.trim())
    .filter(Boolean)

  const context = normalizedChunks.length > 0
    ? normalizedChunks.join('\n')
    : 'No relevant context found.'

  // 把检索结果拼成一个稳定 prompt，约束模型尽量只基于知识库回答。
  return [
    'You must answer based on the following context.',
    '',
    'Context:',
    context,
    '',
    'Question:',
    normalizedQuestion,
  ].join('\n')
}
