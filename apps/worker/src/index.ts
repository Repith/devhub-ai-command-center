import { Worker } from "bullmq";

import { createDatabaseClient } from "@devhub/database";
import { formatServiceName } from "@devhub/domain";

import { loadWorkerConfig } from "./config.js";
import { processDocument } from "./document-processor.js";

const processDocumentQueueName = "process-document";

export function getWorkerName(): string {
  return formatServiceName("Worker");
}

if (require.main === module) {
  const config = loadWorkerConfig();
  const database = createDatabaseClient(config.databaseUrl);
  const worker = new Worker(
    processDocumentQueueName,
    async (job) => {
      await processDocument({
        database,
        storageDir: config.storageDir,
        input: job.data
      });
    },
    {
      connection: toRedisConnection(config.redisUrl),
      concurrency: 2,
      lockDuration: 120_000
    }
  );

  const shutdown = async (): Promise<void> => {
    await worker.close();
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
