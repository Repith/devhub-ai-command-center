import { resolve } from "node:path";

export interface WorkerConfig {
  databaseUrl: string;
  redisUrl: string;
  storageDir: string;
}

export function loadWorkerConfig(): WorkerConfig {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required.");
  }
  return {
    databaseUrl,
    redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",
    storageDir: resolve(process.env.DOCUMENT_STORAGE_DIR ?? "data/uploads")
  };
}
