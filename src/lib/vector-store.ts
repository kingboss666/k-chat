import fs from 'node:fs/promises'
import path from 'node:path'

export interface VectorDocument {
  text: string
  vector: number[]
}

export interface VectorSearchResult extends VectorDocument {
  score: number
}

function dotProduct(left: number[], right: number[]) {
  return left.reduce((total, value, index) => total + value * (right[index] ?? 0), 0)
}

function magnitude(vector: number[]) {
  return Math.sqrt(vector.reduce((total, value) => total + value * value, 0))
}

export function cosineSimilarity(left: number[], right: number[]) {
  if (left.length === 0 || right.length === 0 || left.length !== right.length) {
    return 0
  }

  const denominator = magnitude(left) * magnitude(right)
  if (denominator === 0) {
    return 0
  }

  return dotProduct(left, right) / denominator
}

export class LocalVectorStore {
  private readonly storePath: string

  constructor(storePath = path.join(process.cwd(), 'memory', 'vectors.json')) {
    this.storePath = storePath
  }

  async loadAll(): Promise<VectorDocument[]> {
    try {
      const data = await fs.readFile(this.storePath, 'utf-8')
      const parsed = JSON.parse(data) as unknown

      if (!Array.isArray(parsed)) {
        return []
      }

      return parsed.filter((item): item is VectorDocument => {
        if (!item || typeof item !== 'object') {
          return false
        }

        const record = item as { text?: unknown, vector?: unknown }
        return typeof record.text === 'string'
          && Array.isArray(record.vector)
          && record.vector.every(value => typeof value === 'number')
      })
    }
    catch {
      return []
    }
  }

  async save(document: VectorDocument): Promise<void> {
    await this.saveMany([document])
  }

  async saveMany(documentsToSave: VectorDocument[]): Promise<void> {
    if (documentsToSave.length === 0) {
      return
    }

    const documents = await this.loadAll()
    documents.push(...documentsToSave)

    await fs.mkdir(path.dirname(this.storePath), { recursive: true })
    await fs.writeFile(this.storePath, JSON.stringify(documents, null, 2), 'utf-8')
  }

  async search(queryVector: number[], topK = 3): Promise<VectorSearchResult[]> {
    const documents = await this.loadAll()

    // 当前是最简单实现：全量扫描所有向量，算相似度后直接取 topK。
    return documents
      .map(document => ({
        ...document,
        score: cosineSimilarity(queryVector, document.vector),
      }))
      .sort((left, right) => right.score - left.score)
      .slice(0, Math.max(1, topK))
  }
}
