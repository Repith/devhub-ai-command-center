import { resolve } from "node:path";

export interface WorkerConfig {
  databaseUrl: string;
  embeddingModel: string;
  embeddingTimeoutMs: number;
  llmModel: string;
  llmTimeoutMs: number;
  ollamaApiKey: string;
  ollamaBaseUrl: string;
  ocrMaxPdfPages: number;
  ocrModel: string;
  ocrTextMinCharacters: number;
  ocrTextMinWords: number;
  ocrTimeoutMs: number;
  qdrantCollectionName: string;
  qdrantUrl: string;
  redisUrl: string;
  rssTimeoutMs: number;
  storageDir: string;
}

export function loadWorkerConfig(): WorkerConfig {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required.");
  }
  return {
    databaseUrl,
    embeddingModel: process.env.OLLAMA_EMBEDDING_MODEL ?? "nomic-embed-text",
    embeddingTimeoutMs: Number(process.env.EMBEDDING_TIMEOUT_MS ?? 120000),
    llmModel: process.env.OLLAMA_CHAT_MODEL ?? "qwen3:8b",
    llmTimeoutMs: Number(process.env.OLLAMA_CHAT_TIMEOUT_MS ?? 120000),
    ollamaApiKey: process.env.OLLAMA_API_KEY ?? "ollama",
    ollamaBaseUrl: process.env.OLLAMA_BASE_URL ?? "http://localhost:11434/v1",
    ocrMaxPdfPages: Number(process.env.OCR_PDF_MAX_PAGES ?? 8),
    ocrModel: process.env.OLLAMA_OCR_MODEL ?? "qwen2.5vl:7b",
    ocrTextMinCharacters: Number(process.env.OCR_TEXT_MIN_CHARACTERS ?? 120),
    ocrTextMinWords: Number(process.env.OCR_TEXT_MIN_WORDS ?? 20),
    ocrTimeoutMs: Number(process.env.OCR_TIMEOUT_MS ?? 120000),
    qdrantCollectionName:
      process.env.QDRANT_COLLECTION_NAME ?? "devhub_document_chunks",
    qdrantUrl: process.env.QDRANT_URL ?? "http://localhost:6333",
    redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",
    rssTimeoutMs: Number(process.env.RSS_TOOL_TIMEOUT_MS ?? 10000),
    storageDir: resolve(process.env.DOCUMENT_STORAGE_DIR ?? "data/uploads")
  };
}
