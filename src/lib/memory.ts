export interface Message {
  role: 'user' | 'assistant'
  content: string
}

export class ShortTermMemory {
  private history: Message[] = []
  private readonly maxLength: number

  constructor(maxLength = 6) {
    this.maxLength = maxLength
  }

  push(message: Message): void {
    this.history.push(message)

    if (this.history.length > this.maxLength) {
      this.history = this.history.slice(-this.maxLength)
    }
  }

  getHistory(): Message[] {
    return [...this.history]
  }

  clear(): void {
    this.history = []
  }

  size(): number {
    return this.history.length
  }
}

export class SummaryMemory {
  private history: Message[] = []
  private summary: string = ''
  private readonly summaryThreshold: number

  constructor(summaryThreshold = 20) {
    this.summaryThreshold = summaryThreshold
  }

  push(message: Message): void {
    this.history.push(message)
  }

  getHistory(): Message[] {
    return [...this.history]
  }

  getSummary(): string {
    return this.summary
  }

  setSummary(summary: string): void {
    this.summary = summary
  }

  shouldSummarize(): boolean {
    return this.history.length > this.summaryThreshold
  }

  getMessagesToSummarize(): Message[] {
    const keepRecent = 6
    const toSummarize = this.history.slice(0, -keepRecent)
    return toSummarize
  }

  clearOldMessages(): void {
    const keepRecent = 6
    this.history = this.history.slice(-keepRecent)
  }

  clear(): void {
    this.history = []
    this.summary = ''
  }

  size(): number {
    return this.history.length
  }
}
