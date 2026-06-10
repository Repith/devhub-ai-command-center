import { describe, expect, it } from "vitest";

import { FakeLlmProvider } from "@devhub/ai";
import type { GoldenEvaluationJob } from "@devhub/contracts";
import type {
  CreateEvaluationResultInput,
  EvaluationResultRecord,
  EvaluationRunRecord,
  GoldenCaseWithAgentRecord
} from "@devhub/database";
import type { TenantContext } from "@devhub/domain";

import {
  evaluateAnswer,
  GoldenEvaluationProcessor
} from "../src/golden-evaluation-processor";

describe("GoldenEvaluationProcessor", () => {
  it("scores expected facts, forbidden claims, and expected sources", () => {
    const result = evaluateAnswer(
      {
        expectedFacts: ["RAG answer"],
        forbiddenClaims: ["cross tenant"],
        expectedSources: ["source-a.md"]
      },
      "This RAG answer cites source-a.md and stays tenant safe."
    );

    expect(result).toMatchObject({
      passed: true,
      score: 1,
      retrievalHit: true
    });
  });

  it("runs all golden cases and stores repeatable reports", async () => {
    const repository = new FakeGoldenRepository([
      goldenCase("00000000-0000-4000-8000-000000000101")
    ]);
    const llmProvider = new FakeLlmProvider({
      chunks: ["The answer includes expected fact and source-a.md."],
      usage: { inputTokens: 9, outputTokens: 7 }
    });

    await new GoldenEvaluationProcessor({
      evaluations: repository,
      llmProvider,
      timeoutMs: 10_000
    }).process(job());

    expect(repository.completed).toBe(true);
    expect(repository.results).toEqual([
      expect.objectContaining({
        goldenCaseId: "00000000-0000-4000-8000-000000000101",
        passed: true,
        score: 1,
        inputTokens: 9,
        outputTokens: 7,
        retrievalHit: true
      })
    ]);
    expect(llmProvider.requests[0]?.messages.at(-1)?.content).toContain(
      "Evaluation instruction"
    );
  });
});

class FakeGoldenRepository {
  public readonly results: CreateEvaluationResultInput[] = [];
  public completed = false;
  public failed = false;

  public constructor(
    private readonly goldenCases: readonly GoldenCaseWithAgentRecord[]
  ) {}

  public markEvaluationRunning(): Promise<EvaluationRunRecord> {
    return Promise.resolve(evaluationRunRecord("RUNNING"));
  }

  public listCasesForEvaluation(): Promise<
    readonly GoldenCaseWithAgentRecord[]
  > {
    return Promise.resolve(this.goldenCases);
  }

  public createEvaluationResult(
    _context: TenantContext,
    evaluationRunId: string,
    input: CreateEvaluationResultInput
  ): Promise<EvaluationResultRecord> {
    this.results.push(input);
    return Promise.resolve(evaluationResultRecord(evaluationRunId, input));
  }

  public markEvaluationCompleted(): Promise<EvaluationRunRecord> {
    this.completed = true;
    return Promise.resolve(evaluationRunRecord("COMPLETED"));
  }

  public markEvaluationFailed(): Promise<EvaluationRunRecord> {
    this.failed = true;
    return Promise.resolve(evaluationRunRecord("FAILED"));
  }
}

function goldenCase(id: string): GoldenCaseWithAgentRecord {
  const now = new Date();
  return {
    id,
    tenantId: job().tenantId,
    agentId: "00000000-0000-4000-8000-000000000201",
    name: "Expected fact case",
    input: "Answer the golden case.",
    expectedFacts: ["expected fact"],
    forbiddenClaims: ["forbidden claim"],
    expectedSources: ["source-a.md"],
    createdAt: now,
    updatedAt: now,
    agent: {
      id: "00000000-0000-4000-8000-000000000201",
      tenantId: job().tenantId,
      name: "Golden Agent",
      description: null,
      provider: "ollama",
      model: "qwen3:8b",
      systemPrompt: "Answer carefully.",
      maxSteps: 8,
      maxToolCalls: 4,
      maxTokens: null,
      timeoutMs: 120_000,
      enabledToolIds: [],
      knowledgeBaseIds: [],
      createdAt: now,
      updatedAt: now
    }
  };
}

function evaluationRunRecord(status: EvaluationRunRecord["status"]) {
  const now = new Date();
  return {
    id: job().evaluationRunId,
    tenantId: job().tenantId,
    status,
    configVersion: "golden-set:v1:test",
    startedAt: now,
    completedAt: status === "RUNNING" ? null : now,
    createdAt: now,
    updatedAt: now
  };
}

function evaluationResultRecord(
  evaluationRunId: string,
  input: CreateEvaluationResultInput
): EvaluationResultRecord {
  return {
    id: "00000000-0000-4000-8000-000000000301",
    tenantId: job().tenantId,
    evaluationRunId,
    goldenCaseId: input.goldenCaseId,
    passed: input.passed,
    score: input.score,
    details: input.details,
    latencyMs: input.latencyMs,
    inputTokens: input.inputTokens,
    outputTokens: input.outputTokens,
    retrievalHit: input.retrievalHit,
    createdAt: new Date()
  };
}

function job(): GoldenEvaluationJob {
  return {
    version: 1,
    tenantId: "00000000-0000-4000-8000-000000000001",
    userId: "00000000-0000-4000-8000-000000000002",
    correlationId: "correlation-test",
    evaluationRunId: "00000000-0000-4000-8000-000000000003"
  };
}
