import { Inject, Injectable, type OnApplicationShutdown } from "@nestjs/common";
import { Queue } from "bullmq";

import type { DocumentIngestionJob } from "@devhub/contracts";

import type { DocumentsConfig } from "./documents.config";

export const processDocumentQueueName = "process-document";

export interface DocumentIngestionQueue {
  enqueue(input: DocumentIngestionJob): Promise<void>;
}

@Injectable()
export class BullMqDocumentIngestionQueue
  implements DocumentIngestionQueue, OnApplicationShutdown
{
  private readonly queue: Queue<DocumentIngestionJob>;

  public constructor(@Inject("DOCUMENTS_CONFIG") config: DocumentsConfig) {
    this.queue = new Queue<DocumentIngestionJob>(processDocumentQueueName, {
      connection: toRedisConnection(config.redisUrl)
    });
  }

  public async enqueue(input: DocumentIngestionJob): Promise<void> {
    await this.queue.add("process", input, {
      jobId: `process-document:${input.tenantId}:${input.documentId}:1`,
      attempts: 3,
      backoff: { type: "exponential", delay: 1000 },
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 1000 }
    });
  }

  public async onApplicationShutdown(): Promise<void> {
    await this.queue.close();
  }
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
