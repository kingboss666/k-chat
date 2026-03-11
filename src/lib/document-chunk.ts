export interface DocumentChunk {
  id: string
  text: string
  tokenCount: number
  startChar: number
  endChar: number
  index: number
}

export interface DocumentChunkOptions {
  maxTokens?: number
  overlapTokens?: number
  sourceId?: string
}

interface TextUnit {
  text: string
  tokenCount: number
}

const DEFAULT_MAX_TOKENS = 500
const DEFAULT_OVERLAP_TOKENS = 50

export function estimateTokenCount(text: string): number {
  const normalized = text.trim()
  if (!normalized) {
    return 0
  }

  const cjkCount = (normalized.match(/[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/g) ?? []).length
  const latinWords = normalized.match(/[a-z0-9]+(?:['_-][a-z0-9]+)*/gi) ?? []
  const latinWordTokens = latinWords.reduce((total, word) => total + Math.max(1, Math.ceil(word.length / 4)), 0)
  const symbolChars = normalized
    .replace(/[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/g, '')
    .replace(/[a-z0-9]+(?:['_-][a-z0-9]+)*/gi, '')
    .replace(/\s+/g, '')
    .length

  return Math.max(1, cjkCount + latinWordTokens + Math.ceil(symbolChars / 2))
}

function splitIntoSentences(text: string): string[] {
  const normalized = text.replace(/\r\n/g, '\n').trim()
  if (!normalized) {
    return []
  }

  return normalized
    .split(/(?<=[。！？!?；;.\n])\s+/)
    .map(sentence => sentence.trim())
    .filter(Boolean)
}

function splitOversizedSentence(text: string, maxTokens: number): string[] {
  const parts: string[] = []
  const segments = text.match(/[a-z0-9]+(?:['_-][a-z0-9]+)*|\S/gi) ?? []

  let current = ''

  for (const segment of segments) {
    const candidate = current ? `${current}${/^[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF，。！？；：、,.!?;:]$/.test(segment) ? '' : ' '}${segment}` : segment

    if (estimateTokenCount(candidate) <= maxTokens) {
      current = candidate
      continue
    }

    if (current) {
      parts.push(current.trim())
    }

    current = segment
  }

  if (current.trim()) {
    parts.push(current.trim())
  }

  return parts
}

function toTextUnits(text: string, maxTokens: number): TextUnit[] {
  const paragraphs = text
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map(paragraph => paragraph.trim())
    .filter(Boolean)

  const units: TextUnit[] = []

  for (const paragraph of paragraphs) {
    const sentences = splitIntoSentences(paragraph)

    for (const sentence of sentences) {
      const tokenCount = estimateTokenCount(sentence)
      if (tokenCount <= maxTokens) {
        units.push({ text: sentence, tokenCount })
        continue
      }

      for (const piece of splitOversizedSentence(sentence, maxTokens)) {
        units.push({
          text: piece,
          tokenCount: estimateTokenCount(piece),
        })
      }
    }
  }

  return units
}

function getOverlapUnits(units: TextUnit[], overlapTokens: number): TextUnit[] {
  if (overlapTokens <= 0 || units.length === 0) {
    return []
  }

  const overlap: TextUnit[] = []
  let total = 0

  for (let index = units.length - 1; index >= 0; index -= 1) {
    const unit = units[index]
    overlap.unshift(unit)
    total += unit.tokenCount

    if (total >= overlapTokens) {
      break
    }
  }

  return overlap
}

function locateChunkBounds(sourceText: string, chunkText: string, previousStartChar: number) {
  const searchStart = Math.max(0, previousStartChar)
  const directMatch = sourceText.indexOf(chunkText, searchStart)
  const fallbackMatch = directMatch >= 0 ? directMatch : sourceText.indexOf(chunkText)
  const startChar = fallbackMatch >= 0 ? fallbackMatch : searchStart

  return {
    startChar,
    endChar: startChar + chunkText.length - 1,
  }
}

export function chunkDocument(text: string, options: DocumentChunkOptions = {}): DocumentChunk[] {
  const normalized = text.trim()
  if (!normalized) {
    return []
  }

  const maxTokens = Math.max(1, options.maxTokens ?? DEFAULT_MAX_TOKENS)
  const overlapTokens = Math.min(Math.max(0, options.overlapTokens ?? DEFAULT_OVERLAP_TOKENS), Math.max(0, maxTokens - 1))
  const units = toTextUnits(normalized, maxTokens)

  if (units.length === 0) {
    return []
  }

  const chunks: DocumentChunk[] = []
  let currentUnits: TextUnit[] = []
  let currentTokenCount = 0
  let previousStartChar = 0

  const flushChunk = () => {
    if (currentUnits.length === 0) {
      return
    }

    const text = currentUnits.map(unit => unit.text).join('\n')
    const { startChar, endChar } = locateChunkBounds(normalized, text, previousStartChar)

    chunks.push({
      id: `${options.sourceId ?? 'doc'}-chunk-${chunks.length + 1}`,
      text,
      tokenCount: estimateTokenCount(text),
      startChar,
      endChar,
      index: chunks.length,
    })

    previousStartChar = startChar + 1

    currentUnits = getOverlapUnits(currentUnits, overlapTokens)
    currentTokenCount = currentUnits.reduce((total, unit) => total + unit.tokenCount, 0)
  }

  for (const unit of units) {
    const shouldFlush = currentUnits.length > 0 && currentTokenCount + unit.tokenCount > maxTokens

    if (shouldFlush) {
      flushChunk()
    }

    currentUnits.push(unit)
    currentTokenCount += unit.tokenCount
  }

  flushChunk()

  return chunks
}
