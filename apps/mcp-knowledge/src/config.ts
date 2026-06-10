export interface KnowledgeServerConfig {
  databaseUrl: string;
  embeddingModel: string;
  embeddingTimeoutMs: number;
  ollamaApiKey: string;
  ollamaBaseUrl: string;
  qdrantCollectionName: string;
  qdrantUrl: string;
}

export function loadKnowledgeServerConfig(): KnowledgeServerConfig {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required.");
  }
  return {
    databaseUrl,
    embeddingModel: process.env.OLLAMA_EMBEDDING_MODEL ?? "nomic-embed-text",
    embeddingTimeoutMs: Number(process.env.EMBEDDING_TIMEOUT_MS ?? 120000),
    ollamaApiKey: process.env.OLLAMA_API_KEY ?? "ollama",
    ollamaBaseUrl: process.env.OLLAMA_BASE_URL ?? "http://localhost:11434/v1",
    qdrantCollectionName:
      process.env.QDRANT_COLLECTION_NAME ?? "devhub_document_chunks",
    qdrantUrl: process.env.QDRANT_URL ?? "http://localhost:6333"
  };
}
