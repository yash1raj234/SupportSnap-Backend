import type { Chunk, ScrapedPage } from '../types/index.js';

const CHUNK_SIZE = 500;
const OVERLAP_SIZE = 50;

function splitIntoWords(text: string): string[] {
  return text.split(/\s+/).filter(Boolean);
}

function wordsToText(words: string[]): string {
  return words.join(' ');
}

function splitIntoSentences(text: string): string[] {
  // Avoid lookbehind assertion — split on sentence-ending punctuation + whitespace directly
  return text
    .split(/[.!?]+\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function chunkText(text: string): string[] {
  const words = splitIntoWords(text);
  if (words.length === 0) return [];

  const chunks: string[] = [];
  let start = 0;

  while (start < words.length) {
    const end = Math.min(start + CHUNK_SIZE, words.length);
    const chunkWords = words.slice(start, end);

    const chunkText = wordsToText(chunkWords);

    const sentences = splitIntoSentences(chunkText);
    if (sentences.length > 1 && end < words.length) {
      const lastCompleteSentences = sentences.slice(0, -1).join(' ');
      if (lastCompleteSentences.length > 100) {
        chunks.push(lastCompleteSentences);
        const lastSentenceWords = splitIntoWords(sentences[sentences.length - 1] ?? '');
        start = end - lastSentenceWords.length;
        continue;
      }
    }

    chunks.push(chunkText);
    if (end >= words.length) break; // all words consumed — exit loop
    start = end - OVERLAP_SIZE;
    if (start <= 0) start = end; // guard against negative/zero start causing re-scan
  }

  return chunks.filter((c) => c.length >= 50);
}

export function chunkPages(pages: ScrapedPage[]): Chunk[] {
  const allChunks: Chunk[] = [];

  for (const page of pages) {
    if (!page.content || page.content.length < 50) continue;

    const paragraphs = page.content.split(/\n{2,}/).filter((p) => p.trim().length > 50);
    const fullText = paragraphs.join('\n\n');

    const textChunks = chunkText(fullText);

    textChunks.forEach((text, index) => {
      allChunks.push({
        text,
        metadata: {
          sourceUrl: page.url,
          pageTitle: page.title,
          chunkIndex: index,
        },
      });
    });
  }

  return allChunks;
}
