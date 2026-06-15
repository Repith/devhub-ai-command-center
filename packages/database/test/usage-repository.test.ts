import { describe, expect, it } from "vitest";

import type { DatabaseClient } from "../src";
import { PrismaUsageRepository } from "../src";

describe("PrismaUsageRepository", () => {
  it("summarizes large local datasets through cursor windows", async () => {
    const tenantId = "00000000-0000-0000-0000-000000000001";
    const agentId = "00000000-0000-0000-0000-000000000002";
    const runId = "00000000-0000-0000-0000-000000000003";
    const records = Array.from({ length: 1005 }, (_item, index) =>
      usageRecord({
        id: `${index.toString().padStart(12, "0")}-usage`,
        tenantId,
        agentId,
        runId,
        inputTokens: 1,
        outputTokens: 2
      })
    );
    const calls: unknown[] = [];
    const database = {
      tokenUsage: {
        findMany: (input: {
          take: number;
          cursor?: { id: string };
          skip?: number;
        }) => {
          calls.push(input);
          const start = input.cursor
            ? records.findIndex((record) => record.id === input.cursor!.id) +
              (input.skip ?? 0)
            : 0;
          return Promise.resolve(records.slice(start, start + input.take));
        }
      }
    } as unknown as DatabaseClient;
    const repository = new PrismaUsageRepository(database);

    const summary = await repository.summarize(
      { tenantId, userId: agentId, correlationId: "usage-test" },
      { period: "all" }
    );

    expect(calls).toHaveLength(2);
    expect(summary.tenant).toMatchObject({
      inputTokens: 1005,
      outputTokens: 2010,
      totalTokens: 3015
    });
    expect(summary.runs).toEqual([
      expect.objectContaining({
        runId,
        templateKey: "usage-analyst",
        workflowVersion: 3,
        toolCallsUsed: 2,
        retrievalHit: true,
        finalAnswerTokens: 2010,
        modelLatencyMs: 1005
      })
    ]);
  });
});

function usageRecord(input: {
  id: string;
  tenantId: string;
  agentId: string;
  runId: string;
  inputTokens: number;
  outputTokens: number;
}) {
  const now = new Date("2026-06-15T12:00:00.000Z");
  return {
    id: input.id,
    tenantId: input.tenantId,
    agentRunId: input.runId,
    provider: "ollama",
    model: "qwen3:8b",
    inputTokens: input.inputTokens,
    outputTokens: input.outputTokens,
    costMicros: 0n,
    latencyMs: 1,
    retryCount: 0,
    createdAt: now,
    agentRun: {
      agentId: input.agentId,
      status: "COMPLETED",
      configSnapshot: {
        agentId: input.agentId,
        provider: "ollama",
        model: "qwen3:8b",
        systemPrompt: "Track usage.",
        templateKey: "usage-analyst",
        maxSteps: 8,
        maxToolCalls: 4,
        maxTokens: null,
        timeoutMs: 120_000,
        enabledToolIds: ["knowledge.search", "usage.summary"],
        knowledgeBaseIds: [],
        configVersion: "agent:test:workflow:3",
        workflowVersion: 3
      },
      startedAt: now,
      completedAt: now,
      createdAt: now,
      steps: [
        {
          kind: "rag.retrieve",
          status: "COMPLETED",
          outputPreview: '{"citations":[{"id":"chunk-1"}]}'
        },
        {
          kind: "usage.summary",
          status: "COMPLETED",
          outputPreview: '{"tenant":{"totalTokens":20}}'
        },
        {
          kind: "llm.generate",
          status: "COMPLETED",
          outputPreview: '{"content":"answer"}'
        }
      ]
    }
  };
}
