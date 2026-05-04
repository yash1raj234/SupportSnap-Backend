import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { withRetry } from '../utils/retry.js';
import { ExternalServiceError } from '../utils/errors.js';
import type { Chunk } from '../types/index.js';

const VOYAGE_API_URL = 'https://api.voyageai.com/v1/embeddings';
const VOYAGE_MODEL = 'voyage-2';
const BATCH_SIZE = 128;

interface VoyageResponse {
  data: Array<{ embedding: number[]; index: number }>;
  model: string;
  usage: { total_tokens: number };
}

async function embedBatch(texts: string[]): Promise<number[][]> {
  const response = await withRetry(
    () =>
      fetch(VOYAGE_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${env.VOYAGE_API_KEY}`,
        },
        body: JSON.stringify({
          model: VOYAGE_MODEL,
          input: texts,
        }),
        signal: AbortSignal.timeout(30000),
      }),
    { attempts: 3, baseDelay: 2000 }
  );

  if (!response.ok) {
    const body = await response.text();
    throw new ExternalServiceError(
      `Voyage AI error ${response.status}: ${body}`,
      'EMBEDDING_FAILED'
    );
  }

  const data = (await response.json()) as VoyageResponse;
  return data.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
}

export async function embedChunks(chunks: Chunk[]): Promise<number[][]> {
  const allEmbeddings: number[][] = [];

  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);
    const texts = batch.map((c) => c.text);

    logger.info(
      { batchStart: i, batchEnd: i + batch.length, total: chunks.length },
      'Embedding batch'
    );

    const embeddings = await embedBatch(texts);
    allEmbeddings.push(...embeddings);
  }

  return allEmbeddings;
}

export async function embedQuery(query: string): Promise<number[]> {
  const embeddings = await embedBatch([query]);
  const embedding = embeddings[0];
  if (!embedding) {
    throw new ExternalServiceError('No embedding returned for query', 'EMBEDDING_FAILED');
  }
  return embedding;
}
