# SupportSnap Backend API

Convert any website into an AI support chatbot in 60 seconds using RAG.

## Quick Start

### 1. Get Free API Keys

| Service | URL | Free Tier |
|---------|-----|-----------|
| **Voyage AI** (embeddings) | https://www.voyageai.com/ | 100M tokens/month |
| **Upstash Vector** (vector DB) | https://upstash.com/ | 10k vectors, 10k queries/day |
| **Groq** (LLM) | https://console.groq.com/ | 14.4k requests/day |
| **Jina AI** (scraper, optional) | https://jina.ai/reader/ | Higher rate limits with key |

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your API keys
```

### 3. Install & Run

```bash
npm install
npm run dev
```

Server starts at `http://localhost:3001`

---

## API Reference

### Health Check
```
GET /health
```

### Create a Bot
```
POST /api/generate
Content-Type: application/json

{ "url": "https://stripe.com/docs" }
```

Response:
```json
{
  "success": true,
  "data": {
    "botId": "bot_abc123xyz",
    "stats": {
      "pagesScraped": 47,
      "totalChunks": 156,
      "vectorsStored": 156,
      "processingTime": "42s"
    }
  }
}
```

### Chat with Bot (Streaming SSE)
```
POST /api/chat
Content-Type: application/json

{ "botId": "bot_abc123xyz", "message": "What is the pricing?" }
```

Response (Server-Sent Events):
```
data: {"type":"token","content":"The"}
data: {"type":"token","content":" Pro"}
data: {"type":"token","content":" plan"}
data: {"type":"done"}
```

### Get Bot Info
```
GET /api/bot/:botId
```

---

## Testing with curl

```bash
# 1. Health check
curl http://localhost:3001/health

# 2. Generate a bot (takes 30-60s)
curl -X POST http://localhost:3001/api/generate \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com"}'

# 3. Chat (replace BOT_ID with returned botId)
curl -X POST http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -d '{"botId": "BOT_ID", "message": "What is this website about?"}' \
  --no-buffer
```

---

## Architecture

```
URL Input
   ↓
[Scraper] → Jina AI Reader (up to 50 pages)
   ↓
[Chunker] → 500-word chunks with 50-word overlap
   ↓
[Embeddings] → Voyage AI (voyage-2, 1024 dims)
   ↓
[Vector DB] → Upstash Vector (stored with botId filter)
   ↓
Bot ID returned

Chat Flow:
Question → Embed → Vector Search (top 5) → LLM (Groq/LLaMA 3.1 70B) → Stream
```

## Scripts

```bash
npm run dev      # Development with hot reload
npm run build    # Compile TypeScript
npm start        # Run compiled output
npm run typecheck  # Type check only
```
