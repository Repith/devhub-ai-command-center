import { Inject, Injectable, type OnApplicationShutdown } from "@nestjs/common";
import { Queue } from "bullmq";

import type { AgentRunJob } from "@devhub/contracts";

import { toRedisConnection } from "../common/redis-connection";
import type { RunsConfig } from "./runs.config";

export const runAgentQueueName = "run-agent";

export interface AgentRunQueue {
  enqueue(input: AgentRunJob): Promise<void>;
}

@Injectable()
export class BullMqAgentRunQueue
  implements AgentRunQueue, OnApplicationShutdown
{
  private readonly queue: Queue<AgentRunJob, void, "run">;

  public constructor(@Inject("RUNS_CONFIG") config: RunsConfig) {
    this.queue = new Queue<AgentRunJob, void, "run">(runAgentQueueName, {
      connection: toRedisConnection(config.redisUrl)
    });
  }

  public async enqueue(input: AgentRunJob): Promise<void> {
    await this.queue.add("run", input, {
      jobId: ["run-agent", input.tenantId, input.runId, "1"].join("-"),
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
