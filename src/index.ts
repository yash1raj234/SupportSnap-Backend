import './config/env.js';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { generateRoute } from './routes/generate.js';
import { chatRoute } from './routes/chat.js';
import { botRoute } from './routes/bot.js';

const fastify = Fastify({
  logger: false,
  trustProxy: true,
});

await fastify.register(cors, {
  origin: env.FRONTEND_URL
    ? [env.FRONTEND_URL, /\.vercel\.app$/]
    : true, // allow all in development
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
});

fastify.addHook('onRequest', async (request) => {
  request.startTime = Date.now();
});

fastify.addHook('onResponse', async (request, reply) => {
  logger.info(
    {
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode,
      duration: `${Date.now() - (request.startTime ?? Date.now())}ms`,
      ip: request.ip,
    },
    'Request completed'
  );
});

// Routes
await fastify.register(generateRoute);
await fastify.register(chatRoute);
await fastify.register(botRoute);

// Health check
fastify.get('/health', async () => ({
  status: 'ok',
  timestamp: new Date().toISOString(),
  version: '1.0.0',
}));

fastify.setErrorHandler(async (error, _request, reply) => {
  logger.error({ error: error.message, stack: error.stack }, 'Unhandled error');
  return reply.status(500).send({
    success: false,
    error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
  });
});

fastify.setNotFoundHandler(async (_request, reply) => {
  return reply.status(404).send({
    success: false,
    error: { code: 'NOT_FOUND', message: 'Route not found' },
  });
});

const start = async (): Promise<void> => {
  try {
    await fastify.listen({ port: env.PORT, host: '0.0.0.0' });
    logger.info({ port: env.PORT, env: env.NODE_ENV }, 'SupportSnap API running');
  } catch (err) {
    logger.error(err, 'Failed to start server');
    process.exit(1);
  }
};

process.on('SIGINT', async () => {
  logger.info('Shutting down...');
  await fastify.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Shutting down...');
  await fastify.close();
  process.exit(0);
});

await start();

declare module 'fastify' {
  interface FastifyRequest {
    startTime?: number;
  }
}
