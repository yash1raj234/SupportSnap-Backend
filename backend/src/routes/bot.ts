import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { getBotRecord } from '../services/vectordb.js';
import { formatErrorResponse, AppError } from '../utils/errors.js';

const botParamsSchema = z.object({
  botId: z.string().regex(/^bot_[a-z0-9]{9}$/, 'Invalid bot ID format'),
});

export async function botRoute(fastify: FastifyInstance): Promise<void> {
  fastify.get(
    '/api/bot/:botId',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = botParamsSchema.safeParse(request.params);
      if (!parsed.success) {
        return reply.status(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message },
        });
      }

      try {
        const bot = getBotRecord(parsed.data.botId);

        return reply.send({
          success: true,
          data: {
            botId: bot.botId,
            url: bot.url,
            stats: bot.stats,
            config: {
              model: 'llama-3.3-70b-versatile',
              embeddingModel: 'voyage-2',
              topK: 5,
              similarityThreshold: 0.65,
            },
            createdAt: bot.createdAt,
          },
        });
      } catch (error) {
        const statusCode = error instanceof AppError ? error.statusCode : 500;
        return reply.status(statusCode).send({
          success: false,
          error: formatErrorResponse(error),
        });
      }
    }
  );
}
