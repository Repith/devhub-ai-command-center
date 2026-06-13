import { Inject, Injectable, type OnApplicationShutdown } from "@nestjs/common";
import { Queue } from "bullmq";

import type { DocumentIngestionJob } from "@devhub/contracts";

import { toRedisConnection } from "../common/redis-connection";
import type { DocumentsConfig } from "./documents.config";

export const processDocumentQueueName = "process-document";

export interface DocumentIngestionQueueOptions {
  dedupeKey?: string;
}

export interface DocumentIngestionQueue {
  enqueue(
    input: DocumentIngestionJob,
    options?: DocumentIngestionQueueOptions
  ): Promise<void>;
}

@Injectable()
export class BullMqDocumentIngestionQueue
  implements DocumentIngestionQueue, OnApplicationShutdown
{
  private readonly queue: Queue<DocumentIngestionJob, void, "process">;

  public constructor(@Inject("DOCUMENTS_CONFIG") config: DocumentsConfig) {
    this.queue = new Queue<DocumentIngestionJob, void, "process">(
      processDocumentQueueName,
      {
        connection: toRedisConnection(config.redisUrl)
      }
    );
  }

  public async enqueue(
    input: DocumentIngestionJob,
    options: DocumentIngestionQueueOptions = {}
  ): Promise<void> {
    await this.queue.add("process", input, {
      jobId: jobId(
        "process-document",
        input.tenantId,
        input.documentId,
        options.dedupeKey ?? "1"
      ),
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

function jobId(...parts: readonly string[]): string {
  return parts.map((part) => part.replaceAll(":", "-")).join("-");
}
