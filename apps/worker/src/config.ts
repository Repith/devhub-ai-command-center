import { resolve } from "node:path";

export interface WorkerConfig {
  databaseUrl: string;
  embeddingModel: string;
  embeddingTimeoutMs: number;
  llmModel: string;
  llmTimeoutMs: number;
  ollamaApiKey: string;
  ollamaBaseUrl: string;
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
    qdrantCollectionName:
      process.env.QDRANT_COLLECTION_NAME ?? "devhub_document_chunks",
    qdrantUrl: process.env.QDRANT_URL ?? "http://localhost:6333",
    redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",
    rssTimeoutMs: Number(process.env.RSS_TOOL_TIMEOUT_MS ?? 10000),
    storageDir: resolve(process.env.DOCUMENT_STORAGE_DIR ?? "data/uploads")
  };
}
