import fs from 'node:fs/promises'
import path from 'node:path'

export interface UserProfile {
  name?: string
  profession?: string
  interests?: string[]
  preferences?: Record<string, string>
  facts?: string[]
  [key: string]: unknown
}

function uniqueNonEmpty(values: string[] | undefined): string[] {
  if (!values) {
    return []
  }

  return [...new Set(values.map(item => item.trim()).filter(Boolean))]
}

function normalizePreferences(preferences: Record<string, unknown> | undefined): Record<string, string> {
  if (!preferences) {
    return {}
  }

  return Object.fromEntries(
    Object.entries(preferences)
      .map(([key, value]) => [key.trim(), typeof value === 'string' ? value.trim() : ''])
      .filter(([key, value]) => key.length > 0 && value.length > 0),
  )
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
    const nextProfile: UserProfile = {
      ...this.profile,
      ...updates,
    }

    if (this.profile.interests || updates.interests) {
      nextProfile.interests = uniqueNonEmpty([
        ...(this.profile.interests ?? []),
        ...(updates.interests ?? []),
      ])
    }

    if (this.profile.facts || updates.facts) {
      nextProfile.facts = uniqueNonEmpty([
        ...(this.profile.facts ?? []),
        ...(updates.facts ?? []),
      ])
    }

    if (this.profile.preferences || updates.preferences) {
      nextProfile.preferences = {
        ...normalizePreferences(this.profile.preferences),
        ...normalizePreferences(updates.preferences),
      }
    }

    this.profile = nextProfile
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

    if (this.profile.preferences && Object.keys(this.profile.preferences).length > 0) {
      const preferenceText = Object.entries(this.profile.preferences)
        .map(([key, value]) => `${key}=${value}`)
        .join('；')
      parts.push(`偏好：${preferenceText}`)
    }

    if (this.profile.facts && this.profile.facts.length > 0) {
      parts.push(`已知事实：${this.profile.facts.join('；')}`)
    }

    return parts.length > 0 ? parts.join('\n') : ''
  }
}
