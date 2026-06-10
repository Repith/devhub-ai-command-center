import { resolve } from "node:path";

export const maxDocumentUploadBytes = 10 * 1024 * 1024;

export interface DocumentsConfig {
  storageDir: string;
  redisUrl: string;
}

export function loadDocumentsConfig(): DocumentsConfig {
  return {
    storageDir: resolve(process.env.DOCUMENT_STORAGE_DIR ?? "data/uploads"),
    redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379"
  };
}
