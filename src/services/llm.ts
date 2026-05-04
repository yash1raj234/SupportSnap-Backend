import Groq from 'groq-sdk';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { ExternalServiceError } from '../utils/errors.js';
import type { RetrievedChunk } from '../types/index.js';

const groq = new Groq({ apiKey: env.GROQ_API_KEY });

const MODEL = 'llama-3.3-70b-versatile';
const MAX_TOKENS = 500;
const TEMPERATURE = 0.3;

function buildSystemPrompt(websiteUrl: string, chunks: RetrievedChunk[]): string {
  const context = chunks
    .map((c, i) => `[Source ${i + 1}: ${c.pageTitle} - ${c.sourceUrl}]\n${c.text}`)
    .join('\n\n---\n\n');

  return `You are a helpful AI support assistant for ${websiteUrl}.
Your job is to answer user questions using ONLY the documentation and content provided below.

RULES:
- Answer ONLY based on the provided context below
- If the answer is not in the context, say exactly: "I don't have that information in the documentation. Please contact our support team for help."
- Be concise and helpful
- Do not make up information or use outside knowledge
- If relevant, mention which page/section the information comes from

CONTEXT FROM WEBSITE:
${context}`;
}

export async function* streamAnswer(
  userMessage: string,
  websiteUrl: string,
  chunks: RetrievedChunk[]
): AsyncGenerator<string> {
  if (chunks.length === 0) {
    yield "I don't have that information in the documentation. Please contact our support team for help.";
    return;
  }

  const systemPrompt = buildSystemPrompt(websiteUrl, chunks);

  logger.info({ chunkCount: chunks.length, model: MODEL }, 'Streaming LLM response');

  try {
    const stream = await groq.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      max_tokens: MAX_TOKENS,
      temperature: TEMPERATURE,
      stream: true,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) yield content;
    }
  } catch (error) {
    logger.error({ error: String(error) }, 'Groq streaming error');
    throw new ExternalServiceError('LLM service error. Please try again.', 'LLM_ERROR');
  }
}
