import fs from 'node:fs/promises'
import path from 'node:path'

export interface UserProfile {
  name?: string
  profession?: string
  interests?: string[]
  preferences?: Record<string, unknown>
  [key: string]: unknown
}

export class LongTermMemory {
  private readonly memoryPath: string
  private profile: UserProfile = {}

  constructor(memoryPath = path.join(process.cwd(), 'memory', 'user.json')) {
    this.memoryPath = memoryPath
  }

  async load(): Promise<void> {
    try {
      const data = await fs.readFile(this.memoryPath, 'utf-8')
      this.profile = JSON.parse(data)
    }
    catch {
      this.profile = {}
    }
  }

  async save(): Promise<void> {
    try {
      await fs.mkdir(path.dirname(this.memoryPath), { recursive: true })
      await fs.writeFile(this.memoryPath, JSON.stringify(this.profile, null, 2), 'utf-8')
    }
    catch (error) {
      console.error('Failed to save long-term memory:', error)
    }
  }

  getProfile(): UserProfile {
    return { ...this.profile }
  }

  update(updates: Partial<UserProfile>): void {
    this.profile = { ...this.profile, ...updates }
  }

  get(key: string): unknown {
    return this.profile[key]
  }

  set(key: string, value: unknown): void {
    this.profile[key] = value
  }

  toContextString(): string {
    const parts: string[] = []

    if (this.profile.name) {
      parts.push(`用户名：${this.profile.name}`)
    }

    if (this.profile.profession) {
      parts.push(`职业：${this.profile.profession}`)
    }

    if (this.profile.interests && this.profile.interests.length > 0) {
      parts.push(`兴趣：${this.profile.interests.join('、')}`)
    }

    return parts.length > 0 ? parts.join('\n') : ''
  }
}
