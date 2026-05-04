import { logger } from './logger.js';

interface RetryOptions {
  attempts?: number;
  baseDelay?: number;
  maxDelay?: number;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const { attempts = 3, baseDelay = 1000, maxDelay = 10000 } = options;

  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt === attempts) break;

      const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay);
      logger.warn({ attempt, delay, error: lastError.message }, 'Retrying after failure');
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}
