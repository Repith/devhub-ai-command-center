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
import { OllamaVisionOcrProvider } from "./ocr-provider.js";
import { processGoldenEvaluation } from "./golden-evaluation-processor.js";
import { RedisRealtimeEventPublisher } from "./realtime-event-publisher.js";
import { toRedisConnection } from "./redis-connection.js";

const processDocumentQueueName = "process-document";
const runAgentQueueName = "run-agent";
const evaluateGoldenSetQueueName = "evaluate-golden-set";

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
  const ocrProvider = new OllamaVisionOcrProvider({
    baseUrl: config.ollamaBaseUrl,
    apiKey: config.ollamaApiKey,
    model: config.ocrModel,
    timeoutMs: config.ocrTimeoutMs
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
        ocrMaxPdfPages: config.ocrMaxPdfPages,
        ocrProvider,
        ocrTextMinCharacters: config.ocrTextMinCharacters,
        ocrTextMinWords: config.ocrTextMinWords,
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
        retryCount: job.attemptsMade,
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
  const goldenEvaluationWorker = new Worker(
    evaluateGoldenSetQueueName,
    async (job) => {
      await processGoldenEvaluation({
        database,
        input: job.data,
        llmProvider,
        timeoutMs: config.llmTimeoutMs
      });
    },
    {
      connection: toRedisConnection(config.redisUrl),
      concurrency: 1,
      lockDuration: config.llmTimeoutMs + 30_000
    }
  );

  documentWorker.on("completed", (job) => {
    console.log(`Document ingestion completed: ${job.id}`);
  });
  documentWorker.on("failed", (job, error) => {
    console.error(
      `Document ingestion failed: ${job?.id ?? "unknown"} ${error.message}`
    );
  });
  agentWorker.on("failed", (job, error) => {
    console.error(`Agent run failed: ${job?.id ?? "unknown"} ${error.message}`);
  });
  goldenEvaluationWorker.on("failed", (job, error) => {
    console.error(
      `Golden evaluation failed: ${job?.id ?? "unknown"} ${error.message}`
    );
  });

  const shutdown = async (): Promise<void> => {
    await Promise.all([
      documentWorker.close(),
      agentWorker.close(),
      goldenEvaluationWorker.close()
    ]);
    publisher.disconnect();
    await database.$disconnect();
  };
  process.once("SIGINT", () => void shutdown().then(() => process.exit(0)));
  process.once("SIGTERM", () => void shutdown().then(() => process.exit(0)));
  console.log(`${getWorkerName()} is processing queues.`);
}
