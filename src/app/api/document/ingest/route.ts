import { z } from 'zod'
import { chunkDocument } from '@/src/lib/document-chunk'
import { generateQianwenEmbedding } from '@/src/lib/qianwen'
import { LocalVectorStore } from '@/src/lib/vector-store'

const IngestRequestSchema = z.object({
  text: z.string().trim().min(1, 'text is required'),
  maxTokens: z.number().int().positive().max(4000).optional(),
  overlapTokens: z.number().int().min(0).max(1000).optional(),
  sourceId: z.string().trim().min(1).optional(),
})

const vectorStore = new LocalVectorStore()

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const payload = IngestRequestSchema.parse(body)

    const chunks = chunkDocument(payload.text, {
      maxTokens: payload.maxTokens,
      overlapTokens: payload.overlapTokens,
      sourceId: payload.sourceId,
    })

    const documents = await Promise.all(
      chunks.map(async (chunk) => {
        const { vector } = await generateQianwenEmbedding(chunk.text)

        return {
          text: chunk.text,
          vector,
        }
      }),
    )

    await vectorStore.saveMany(documents)

    return Response.json({
      sourceId: payload.sourceId ?? 'doc',
      totalChunks: chunks.length,
      storedDocuments: documents.length,
      config: {
        maxTokens: payload.maxTokens ?? 500,
        overlapTokens: payload.overlapTokens ?? 50,
      },
      preview: chunks.slice(0, 3).map(chunk => ({
        id: chunk.id,
        text: chunk.text,
        tokenCount: chunk.tokenCount,
      })),
    })
  }
  catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json(
        {
          error: 'INVALID_REQUEST',
          issues: error.flatten(),
        },
        { status: 400 },
      )
    }

    return Response.json(
      {
        error: 'SERVER_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    )
  }
}
