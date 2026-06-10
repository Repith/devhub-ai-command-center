import { randomUUID } from "node:crypto";

import Redis from "ioredis";

import type { AgentRunStepRecord } from "@devhub/database";
import type { TenantContext } from "@devhub/domain";
import type { RealtimeEvent } from "@devhub/contracts";

export const realtimeRedisChannel = "devhub:realtime:v1";

export interface RealtimeEventPublisher {
  publish(event: RealtimeEvent): Promise<void>;
}

export class NoopRealtimeEventPublisher implements RealtimeEventPublisher {
  public publish(): Promise<void> {
    return Promise.resolve();
  }
}

export class RedisRealtimeEventPublisher implements RealtimeEventPublisher {
  private readonly redis: Redis;

  public constructor(redisUrl: string) {
    this.redis = new Redis(redisUrl, {
      enableOfflineQueue: false,
      maxRetriesPerRequest: null
    });
    this.redis.on("error", () => {
      // Runtime persistence remains the source of truth if Redis is unavailable.
    });
  }

  public async publish(event: RealtimeEvent): Promise<void> {
    try {
      await this.redis.publish(realtimeRedisChannel, JSON.stringify(event));
    } catch {
      // Durable run state remains in PostgreSQL; realtime can recover via REST.
    }
  }

  public disconnect(): void {
    this.redis.disconnect();
  }
}

export function runEventBase(
  context: TenantContext
): Pick<
  RealtimeEvent,
  "version" | "eventId" | "occurredAt" | "correlationId" | "tenantId"
> {
  return {
    version: 1,
    eventId: randomUUID(),
    occurredAt: new Date().toISOString(),
    correlationId: context.correlationId,
    tenantId: context.tenantId
  };
}

export function toStepEventPayload(
  step: AgentRunStepRecord
): Extract<RealtimeEvent, { type: "agent_run.step_changed" }>["payload"] {
  return {
    runId: step.agentRunId,
    stepId: step.id,
    status: step.status,
    step: {
      id: step.id,
      agentRunId: step.agentRunId,
      sequence: step.sequence,
      kind: step.kind,
      status: step.status,
      inputPreview: step.inputPreview,
      outputPreview: step.outputPreview,
      durationMs: step.durationMs,
      errorCode: step.errorCode,
      errorMessage: step.errorMessage,
      startedAt: step.startedAt?.toISOString() ?? null,
      completedAt: step.completedAt?.toISOString() ?? null,
      createdAt: step.createdAt.toISOString(),
      updatedAt: step.updatedAt.toISOString()
    }
  };
}
