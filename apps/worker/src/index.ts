import { Worker } from "bullmq";

import {
  OllamaOpenAiEmbeddingProvider,
  OllamaOpenAiProvider
} from "@devhub/ai";
import { createDatabaseClient } from "@devhub/database";
import { formatServiceName } from "@devhub/domain";
import { QdrantVectorStore } from "@devhub/rag";

import { processAgentRun } from "./agent-run-processor.js";
import { loadWorkerConfig } from "./config.js";
import { processDocument } from "./document-processor.js";
import { RedisRealtimeEventPublisher } from "./realtime-event-publisher.js";

const processDocumentQueueName = "process-document";
const runAgentQueueName = "run-agent";

export function getWorkerName(): string {
  return formatServiceName("Worker");
}

if (require.main === module) {
  const config = loadWorkerConfig();
  const database = createDatabaseClient(config.databaseUrl);
  const embeddingProvider = new OllamaOpenAiEmbeddingProvider({
    baseUrl: config.ollamaBaseUrl,
    apiKey: config.ollamaApiKey
  });
  const llmProvider = new OllamaOpenAiProvider({
    baseUrl: config.ollamaBaseUrl,
    apiKey: config.ollamaApiKey
  });
  const vectorStore = new QdrantVectorStore({
    url: config.qdrantUrl,
    collectionName: config.qdrantCollectionName
  });
  const publisher = new RedisRealtimeEventPublisher(config.redisUrl);
  const documentWorker = new Worker(
    processDocumentQueueName,
    async (job) => {
      await processDocument({
        database,
        embeddingModel: config.embeddingModel,
        embeddingProvider,
        embeddingTimeoutMs: config.embeddingTimeoutMs,
        storageDir: config.storageDir,
        input: job.data,
        vectorStore
      });
    },
    {
      connection: toRedisConnection(config.redisUrl),
      concurrency: 2,
      lockDuration: 120_000
    }
  );
  const agentWorker = new Worker(
    runAgentQueueName,
    async (job) => {
      await processAgentRun({
        database,
        embeddingModel: config.embeddingModel,
        embeddingProvider,
        embeddingTimeoutMs: config.embeddingTimeoutMs,
        input: job.data,
        llmProvider,
        publisher,
        rssTimeoutMs: config.rssTimeoutMs,
        vectorStore
      });
    },
    {
      connection: toRedisConnection(config.redisUrl),
      concurrency: 1,
      lockDuration: config.llmTimeoutMs + 30_000
    }
  );

  const shutdown = async (): Promise<void> => {
    await Promise.all([documentWorker.close(), agentWorker.close()]);
    publisher.disconnect();
    await database.$disconnect();
  };
  process.once("SIGINT", () => void shutdown().then(() => process.exit(0)));
  process.once("SIGTERM", () => void shutdown().then(() => process.exit(0)));
  console.log(`${getWorkerName()} is processing queues.`);
}

function toRedisConnection(redisUrl: string): {
  host: string;
  port: number;
  maxRetriesPerRequest: null;
} {
  const url = new URL(redisUrl);
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    maxRetriesPerRequest: null
  };
}
