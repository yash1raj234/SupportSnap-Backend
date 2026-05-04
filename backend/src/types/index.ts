export interface ScrapedPage {
  url: string;
  title: string;
  content: string;
}

export interface Chunk {
  text: string;
  metadata: {
    sourceUrl: string;
    pageTitle: string;
    chunkIndex: number;
  };
}

export interface VectorRecord {
  id: string;
  vector: number[];
  metadata: {
    text: string;
    sourceUrl: string;
    pageTitle: string;
    botId: string;
    createdAt: string;
  };
}

export interface BotStats {
  pagesScraped: number;
  totalChunks: number;
  vectorsStored: number;
  processingTime: string;
}

export interface BotRecord {
  botId: string;
  url: string;
  stats: BotStats;
  createdAt: string;
}

export interface ChatMessage {
  botId: string;
  message: string;
}

export interface GenerateRequest {
  url: string;
}

export interface RetrievedChunk {
  text: string;
  sourceUrl: string;
  pageTitle: string;
  score: number;
}

export interface AppError extends Error {
  statusCode: number;
  code: string;
}
