import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { scrapeWebsite } from '../services/scraper.js';
import { chunkPages } from '../services/chunker.js';
import { embedChunks } from '../services/embeddings.js';
import { storeVectors, saveBotRecord, generateBotId } from '../services/vectordb.js';
import { logger } from '../utils/logger.js';
import { formatErrorResponse, AppError } from '../utils/errors.js';

const generateSchema = z.object({
  url: z
    .string()
    .min(1, 'URL is required')
    .refine((val) => {
      try {
        const u = new URL(val.startsWith('http') ? val : `https://${val}`);
        return u.protocol === 'http:' || u.protocol === 'https:';
      } catch {
        return false;
      }
    }, 'Must be a valid HTTP/HTTPS URL'),
});

export async function generateRoute(fastify: FastifyInstance): Promise<void> {
  fastify.post(
    '/api/generate',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const startTime = Date.now();

      const parsed = generateSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message },
        });
      }

      const { url } = parsed.data;
      const botId = generateBotId();

      logger.info({ botId, url }, 'Starting bot generation');

      try {
        // Phase 1: Scrape
        logger.info({ botId }, 'Phase 1: Scraping website');
        const pages = await scrapeWebsite(url);

        // Phase 2: Chunk
        logger.info({ botId, pages: pages.length }, 'Phase 2: Chunking content');
        const chunks = chunkPages(pages);

        if (chunks.length === 0) {
          return reply.status(422).send({
            success: false,
            error: { code: 'NO_CONTENT', message: 'No usable content found at the URL' },
          });
        }

        // Phase 3: Embed
        logger.info({ botId, chunks: chunks.length }, 'Phase 3: Creating embeddings');
        const embeddings = await embedChunks(chunks);

        // Phase 4: Store
        logger.info({ botId }, 'Phase 4: Storing vectors');
        await storeVectors(botId, chunks, embeddings);

        const processingTime = `${Math.round((Date.now() - startTime) / 1000)}s`;

        const stats = {
          pagesScraped: pages.length,
          totalChunks: chunks.length,
          vectorsStored: chunks.length,
          processingTime,
        };

        saveBotRecord({ botId, url, stats, createdAt: new Date().toISOString() });

        logger.info({ botId, stats }, 'Bot generation complete');

        return reply.status(201).send({
          success: true,
          data: { botId, stats },
        });
      } catch (error) {
        logger.error({ botId, error: String(error) }, 'Bot generation failed');
        const statusCode = error instanceof AppError ? error.statusCode : 500;
        return reply.status(statusCode).send({
          success: false,
          error: formatErrorResponse(error),
        });
      }
    }
  );
}
