import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { ExternalServiceError, ValidationError } from '../utils/errors.js';
import type { ScrapedPage } from '../types/index.js';

const JINA_BASE_URL = 'https://r.jina.ai';
const MAX_PAGES = 3;
const MAX_CONTENT_CHARS = 20_000; // 20 KB per page

function buildJinaUrl(targetUrl: string): string {
  return `${JINA_BASE_URL}/${targetUrl}`;
}

function extractLinks(content: string, baseUrl: string): string[] {
  const urlPattern = /https?:\/\/[^\s)"'<>]+/g;
  const matches = content.match(urlPattern) ?? [];

  try {
    const base = new URL(baseUrl);
    return [...new Set(matches)]
      .filter((link) => {
        try {
          const parsed = new URL(link);
          return (
            parsed.hostname === base.hostname &&
            !link.includes('#') &&
            !link.match(/\.(pdf|jpg|jpeg|png|gif|svg|mp4|zip|css|js)$/i)
          );
        } catch {
          return false;
        }
      })
      .slice(0, MAX_PAGES - 1);
  } catch {
    return [];
  }
}

function cleanContent(rawContent: string): string {
  return rawContent
    .replace(/!\[.*?\]\(.*?\)/g, '')
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')
    .replace(/```[\s\S]{0,2000}?```/g, '')
    .replace(/`[^`]{0,500}`/g, '')
    .replace(/#{1,6}\s/g, '')
    .replace(/\*{1,2}([^*]{0,500})\*{1,2}/g, '$1')
    .replace(/_{1,2}([^_]{0,500})_{1,2}/g, '$1')
    .replace(/^\s*[-*+]\s/gm, '')
    .replace(/^\s*\d+\.\s/gm, '')
    .replace(/\|.*\|/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractTitle(content: string, url: string): string {
  const titleMatch = content.match(/^Title:\s*(.+)$/m) ?? content.match(/^#\s+(.+)$/m);
  if (titleMatch?.[1]) return titleMatch[1].trim();
  try {
    return new URL(url).pathname.split('/').filter(Boolean).pop() ?? url;
  } catch {
    return url;
  }
}

// Reads in chunks so a large Jina response cannot OOM the process.
async function fetchJina(url: string, headers: Record<string, string>): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);

  try {
    const resp = await fetch(url, { headers, signal: controller.signal });
    if (!resp.ok || !resp.body) return null;

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let result = '';

    try {
      while (result.length < MAX_CONTENT_CHARS) {
        const { done, value } = await reader.read();
        if (done) break;
        result += decoder.decode(value, { stream: true });
      }
    } finally {
      await reader.cancel().catch(() => undefined);
    }

    return result.slice(0, MAX_CONTENT_CHARS) || null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function scrapeSinglePage(url: string): Promise<ScrapedPage | null> {
  const jinaUrl = buildJinaUrl(url);
  const headers: Record<string, string> = {
    'Accept': 'text/plain',
    'X-Return-Format': 'markdown',
    'X-No-Cache': 'true',
    'Accept-Encoding': 'identity',
  };

  if (env.JINA_API_KEY) {
    headers['Authorization'] = `Bearer ${env.JINA_API_KEY}`;
  }

  try {
    const raw = await fetchJina(jinaUrl, headers);
    if (!raw || raw.length < 100) return null;

    const content = cleanContent(raw);
    const title = extractTitle(raw, url);
    return { url, title, content };
  } catch (error) {
    logger.warn({ url, error: String(error) }, 'Scrape error for page');
    return null;
  }
}

export async function scrapeWebsite(inputUrl: string): Promise<ScrapedPage[]> {
  let normalizedUrl: string;
  try {
    const parsed = new URL(
      inputUrl.startsWith('http') ? inputUrl : `https://${inputUrl}`
    );
    normalizedUrl = parsed.toString();
  } catch {
    throw new ValidationError(`Invalid URL: ${inputUrl}`);
  }

  logger.info({ url: normalizedUrl }, 'Starting website scrape');

  const homePage = await scrapeSinglePage(normalizedUrl);
  if (!homePage) {
    throw new ExternalServiceError(
      `Could not scrape ${normalizedUrl}. Check the URL is publicly accessible.`,
      'SCRAPE_FAILED'
    );
  }

  const pages: ScrapedPage[] = [homePage];
  const visited = new Set<string>([normalizedUrl]);

  const links = extractLinks(homePage.content, normalizedUrl);
  logger.info({ linkCount: links.length }, 'Found internal links');

  for (let i = 0; i < links.length && pages.length < MAX_PAGES; i++) {
    const link = links[i];
    if (!link || visited.has(link)) continue;
    visited.add(link);

    const page = await scrapeSinglePage(link);
    if (page) {
      pages.push(page);
      logger.info({ url: page.url, total: pages.length }, 'Page scraped');
    }
  }

  logger.info({ totalPages: pages.length, url: normalizedUrl }, 'Scraping complete');
  return pages;
}
