import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { embedQuery } from '../services/embeddings.js';
import { queryVectors, getBotRecord } from '../services/vectordb.js';
import { streamAnswer } from '../services/llm.js';
import { logger } from '../utils/logger.js';
import { formatErrorResponse, AppError } from '../utils/errors.js';

const chatSchema = z.object({
  botId: z
    .string()
    .regex(/^bot_[a-z0-9]{9}$/, 'Invalid bot ID format'),
  message: z
    .string()
    .min(1, 'Message cannot be empty')
    .max(500, 'Message too long (max 500 characters)'),
});

export async function chatRoute(fastify: FastifyInstance): Promise<void> {
  fastify.post(
    '/api/chat',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = chatSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message },
        });
      }

      const { botId, message } = parsed.data;

      try {
        const bot = getBotRecord(botId);
        logger.info({ botId, messageLength: message.length }, 'Chat request');

        // Embed the query
        const queryVector = await embedQuery(message);

        // Retrieve relevant chunks
        const chunks = await queryVectors(botId, queryVector);
        logger.info({ botId, retrievedChunks: chunks.length }, 'Chunks retrieved');

        // Set SSE headers
        reply.raw.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
          'Access-Control-Allow-Origin': '*',
        });

        // Stream LLM response
        for await (const token of streamAnswer(message, bot.url, chunks)) {
          const data = JSON.stringify({ type: 'token', content: token });
          reply.raw.write(`data: ${data}\n\n`);
        }

        reply.raw.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
        reply.raw.end();
      } catch (error) {
        logger.error({ botId, error: String(error) }, 'Chat error');

        if (!reply.raw.headersSent) {
          const statusCode = error instanceof AppError ? error.statusCode : 500;
          return reply.status(statusCode).send({
            success: false,
            error: formatErrorResponse(error),
          });
        }

        const errData = JSON.stringify({
          type: 'error',
          error: formatErrorResponse(error),
        });
        reply.raw.write(`data: ${errData}\n\n`);
        reply.raw.end();
      }
    }
  );
}
