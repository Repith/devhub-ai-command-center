import { Inject, Injectable, type OnApplicationShutdown } from "@nestjs/common";
import { Queue } from "bullmq";

import type { GoldenEvaluationJob } from "@devhub/contracts";

import { toRedisConnection } from "../common/redis-connection";
import type { RunsConfig } from "../runs/runs.config";

export const evaluateGoldenSetQueueName = "evaluate-golden-set";

export interface GoldenEvaluationQueue {
  enqueue(input: GoldenEvaluationJob): Promise<void>;
}

@Injectable()
export class BullMqGoldenEvaluationQueue
  implements GoldenEvaluationQueue, OnApplicationShutdown
{
  private readonly queue: Queue<GoldenEvaluationJob, void, "evaluate">;

  public constructor(@Inject("RUNS_CONFIG") config: RunsConfig) {
    this.queue = new Queue<GoldenEvaluationJob, void, "evaluate">(
      evaluateGoldenSetQueueName,
      {
        connection: toRedisConnection(config.redisUrl)
      }
    );
  }

  public async enqueue(input: GoldenEvaluationJob): Promise<void> {
    await this.queue.add("evaluate", input, {
      jobId: [
        "evaluate-golden-set",
        input.tenantId,
        input.evaluationRunId,
        "1"
      ].join("-"),
      attempts: 1,
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 1000 }
    });
  }

  public async onApplicationShutdown(): Promise<void> {
    await this.queue.close();
  }
}
