import { resolve } from "node:path";

export const maxDocumentUploadBytes = 10 * 1024 * 1024;

export interface DocumentsConfig {
  chatModel: string;
  chatMaxTokens: number;
  chatTimeoutMs: number;
  embeddingModel: string;
  embeddingTimeoutMs: number;
  ollamaApiKey: string;
  ollamaBaseUrl: string;
  qdrantCollectionName: string;
  qdrantUrl: string;
  storageDir: string;
  redisUrl: string;
}

export function loadDocumentsConfig(): DocumentsConfig {
  return {
    chatModel: process.env.OLLAMA_CHAT_MODEL ?? "qwen3:8b",
    chatMaxTokens: Number(process.env.OLLAMA_CHAT_MAX_TOKENS ?? 1800),
    chatTimeoutMs: Number(process.env.OLLAMA_CHAT_TIMEOUT_MS ?? 120000),
    embeddingModel: process.env.OLLAMA_EMBEDDING_MODEL ?? "nomic-embed-text",
    embeddingTimeoutMs: Number(process.env.EMBEDDING_TIMEOUT_MS ?? 120000),
    ollamaApiKey: process.env.OLLAMA_API_KEY ?? "ollama",
    ollamaBaseUrl: process.env.OLLAMA_BASE_URL ?? "http://localhost:11434/v1",
    qdrantCollectionName:
      process.env.QDRANT_COLLECTION_NAME ?? "devhub_document_chunks",
    qdrantUrl: process.env.QDRANT_URL ?? "http://localhost:6333",
    storageDir: resolve(process.env.DOCUMENT_STORAGE_DIR ?? "data/uploads"),
    redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379"
  };
}
