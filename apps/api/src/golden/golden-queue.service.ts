import { Inject, Injectable, type OnApplicationShutdown } from "@nestjs/common";
import { Queue } from "bullmq";

import type { GoldenEvaluationJob } from "@devhub/contracts";

import type { RunsConfig } from "../runs/runs.config";

export const evaluateGoldenSetQueueName = "evaluate-golden-set";

export interface GoldenEvaluationQueue {
  enqueue(input: GoldenEvaluationJob): Promise<void>;
}

@Injectable()
export class BullMqGoldenEvaluationQueue
  implements GoldenEvaluationQueue, OnApplicationShutdown
{
  private readonly queue: Queue<GoldenEvaluationJob>;

  public constructor(@Inject("RUNS_CONFIG") config: RunsConfig) {
    this.queue = new Queue<GoldenEvaluationJob>(evaluateGoldenSetQueueName, {
      connection: toRedisConnection(config.redisUrl)
    });
  }

  public async enqueue(input: GoldenEvaluationJob): Promise<void> {
    await this.queue.add("evaluate", input, {
      jobId: `evaluate-golden-set:${input.tenantId}:${input.evaluationRunId}:1`,
      attempts: 1,
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
