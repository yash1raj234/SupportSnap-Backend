import { Index } from '@upstash/vector';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { NotFoundError } from '../utils/errors.js';
import type { Chunk, RetrievedChunk, BotRecord } from '../types/index.js';

const index = new Index({
  url: env.UPSTASH_VECTOR_URL,
  token: env.UPSTASH_VECTOR_TOKEN,
});

const botStore = new Map<string, BotRecord>();

const TOP_K = 5;
const SIMILARITY_THRESHOLD = 0.65;

function makeVectorId(botId: string, chunkIndex: number): string {
  return `${botId}_chunk_${chunkIndex}`;
}

export async function storeVectors(
  botId: string,
  chunks: Chunk[],
  embeddings: number[][]
): Promise<void> {
  const UPSERT_BATCH = 100;

  for (let i = 0; i < chunks.length; i += UPSERT_BATCH) {
    const batch = chunks.slice(i, i + UPSERT_BATCH);
    const batchEmbeddings = embeddings.slice(i, i + UPSERT_BATCH);

    const vectors = batch.map((chunk, batchIdx) => ({
      id: makeVectorId(botId, i + batchIdx),
      vector: batchEmbeddings[batchIdx] as number[],
      metadata: {
        text: chunk.text,
        sourceUrl: chunk.metadata.sourceUrl,
        pageTitle: chunk.metadata.pageTitle,
        botId,
        createdAt: new Date().toISOString(),
      },
    }));

    await index.upsert(vectors);
    logger.info({ stored: i + batch.length, total: chunks.length }, 'Vectors stored');
  }
}

export async function queryVectors(
  botId: string,
  queryVector: number[]
): Promise<RetrievedChunk[]> {
  const results = await index.query({
    vector: queryVector,
    topK: TOP_K,
    includeMetadata: true,
    filter: `botId = '${botId}'`,
  });

  return results
    .filter((r) => (r.score ?? 0) >= SIMILARITY_THRESHOLD)
    .map((r) => ({
      text: (r.metadata as Record<string, string>)['text'] ?? '',
      sourceUrl: (r.metadata as Record<string, string>)['sourceUrl'] ?? '',
      pageTitle: (r.metadata as Record<string, string>)['pageTitle'] ?? '',
      score: r.score ?? 0,
    }));
}

export function saveBotRecord(record: BotRecord): void {
  botStore.set(record.botId, record);
}

export function getBotRecord(botId: string): BotRecord {
  const record = botStore.get(botId);
  if (!record) {
    throw new NotFoundError(`Bot not found: ${botId}`);
  }
  return record;
}

export function generateBotId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const suffix = Array.from({ length: 9 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `bot_${suffix}`;
}
