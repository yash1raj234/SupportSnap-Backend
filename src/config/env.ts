import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  PORT: z.string().default('3001').transform(Number),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  FRONTEND_URL: z.string().optional(), // set in production to your Vercel URL
  JINA_API_KEY: z.string().optional(),
  VOYAGE_API_KEY: z.string().min(1, 'VOYAGE_API_KEY is required'),
  UPSTASH_VECTOR_URL: z.string().url('UPSTASH_VECTOR_URL must be a valid URL'),
  UPSTASH_VECTOR_TOKEN: z.string().min(1, 'UPSTASH_VECTOR_TOKEN is required'),
  GROQ_API_KEY: z.string().min(1, 'GROQ_API_KEY is required'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:');
  parsed.error.issues.forEach((issue) => {
    console.error(`  ${issue.path.join('.')}: ${issue.message}`);
  });
  process.exit(1);
}

export const env = parsed.data;
