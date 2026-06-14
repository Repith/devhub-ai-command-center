import { describe, expect, it } from "vitest";

import { FakeLlmProvider } from "@devhub/ai";
import type { AgentRunJob, GoldenEvaluationJob } from "@devhub/contracts";
import type {
  AgentRunRecord,
  AgentRunStepRecord,
  ConversationMessageRecord,
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
        mode: "FAST_LLM_ONLY",
        passed: true,
        score: 1,
        inputTokens: 9,
        outputTokens: 7,
        retrievalHit: true,
        toolCallsUsed: 0,
        workflowVersion: "fast-llm-only:v1"
      })
    ]);
    expect(llmProvider.requests[0]?.messages.at(-1)?.content).toContain(
      "Evaluation instruction"
    );
  });

  it("runs golden cases through the durable agent runtime mode", async () => {
    const repository = new FakeGoldenRepository([
      goldenCase("00000000-0000-4000-8000-000000000102")
    ]);
    const runtime = new FakeAgentRuntime();

    await new GoldenEvaluationProcessor({
      evaluations: repository,
      llmProvider: new FakeLlmProvider({
        chunks: ["unused"],
        usage: { inputTokens: 1, outputTokens: 1 }
      }),
      runtime,
      timeoutMs: 10_000
    }).process(job("FULL_AGENT_RUNTIME"));

    expect(runtime.jobs).toEqual([
      expect.objectContaining({
        runId: "00000000-0000-4000-8000-000000000401"
      })
    ]);
    expect(repository.results).toEqual([
      expect.objectContaining({
        agentRunId: "00000000-0000-4000-8000-000000000401",
        mode: "FULL_AGENT_RUNTIME",
        passed: true,
        inputTokens: 12,
        outputTokens: 8,
        retrievalHit: true,
        terminalStatus: "COMPLETED",
        toolCallsUsed: 1,
        workflowVersion: "default-langgraph:v1:custom"
      })
    ]);
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

class FakeAgentRuntime {
  public readonly jobs: AgentRunJob[] = [];

  public readonly runs = {
    createQueuedWithUserMessage: () =>
      Promise.resolve(agentRunRecord("RUNNING")),
    findById: () => Promise.resolve(agentRunRecord("COMPLETED")),
    listSteps: () =>
      Promise.resolve([
        agentRunStepRecord({
          kind: "rag.retrieve",
          sequence: 1,
          status: "COMPLETED"
        }),
        agentRunStepRecord({
          kind: "llm.generate",
          sequence: 2,
          status: "COMPLETED"
        })
      ])
  };

  public readonly conversations = {
    listMessages: () =>
      Promise.resolve([
        conversationMessageRecord("USER", "Answer the golden case.", 1),
        conversationMessageRecord(
          "ASSISTANT",
          "The answer includes expected fact and source-a.md.",
          2
        )
      ])
  };

  public readonly runAgent = (input: AgentRunJob): Promise<void> => {
    this.jobs.push(input);
    return Promise.resolve();
  };
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
      templateKey: null,
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

function evaluationRunRecord(
  status: EvaluationRunRecord["status"]
): EvaluationRunRecord {
  const now = new Date();
  return {
    id: job().evaluationRunId,
    tenantId: job().tenantId,
    status,
    mode: "FAST_LLM_ONLY",
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
    mode: input.mode ?? "FAST_LLM_ONLY",
    agentRunId: input.agentRunId ?? null,
    passed: input.passed,
    score: input.score,
    details: input.details,
    latencyMs: input.latencyMs,
    inputTokens: input.inputTokens,
    outputTokens: input.outputTokens,
    retrievalHit: input.retrievalHit,
    toolCallsUsed: input.toolCallsUsed ?? 0,
    terminalStatus: input.terminalStatus ?? null,
    errorCode: input.errorCode ?? null,
    errorMessagePreview: input.errorMessagePreview ?? null,
    workflowVersion: input.workflowVersion ?? null,
    createdAt: new Date()
  };
}

function agentRunRecord(status: AgentRunRecord["status"]): AgentRunRecord {
  const now = new Date();
  return {
    id: "00000000-0000-4000-8000-000000000401",
    tenantId: job().tenantId,
    agentId: "00000000-0000-4000-8000-000000000201",
    conversationId: "00000000-0000-4000-8000-000000000402",
    status,
    input: { message: "Answer the golden case.", retrievalLimit: 5 },
    configSnapshot: {},
    correlationId: "agent-run-correlation",
    startedAt: now,
    completedAt: status === "RUNNING" ? null : now,
    errorCode: null,
    errorMessage: null,
    createdAt: now,
    updatedAt: now
  };
}

function agentRunStepRecord(
  input: Pick<AgentRunStepRecord, "kind" | "sequence" | "status">
): AgentRunStepRecord {
  const now = new Date();
  return {
    id: `00000000-0000-4000-8000-00000000050${input.sequence}`,
    tenantId: job().tenantId,
    agentRunId: "00000000-0000-4000-8000-000000000401",
    sequence: input.sequence,
    kind: input.kind,
    status: input.status,
    inputPreview: null,
    outputPreview: null,
    durationMs: 10,
    errorCode: null,
    errorMessage: null,
    startedAt: now,
    completedAt: now,
    createdAt: now,
    updatedAt: now
  };
}

function conversationMessageRecord(
  role: ConversationMessageRecord["role"],
  content: string,
  sequence: number
): ConversationMessageRecord {
  return {
    id: `00000000-0000-4000-8000-00000000060${sequence}`,
    tenantId: job().tenantId,
    conversationId: "00000000-0000-4000-8000-000000000402",
    role,
    content,
    sequence,
    provider: role === "ASSISTANT" ? "fake" : null,
    model: role === "ASSISTANT" ? "qwen3:8b" : null,
    inputTokens: role === "ASSISTANT" ? 12 : null,
    outputTokens: role === "ASSISTANT" ? 8 : null,
    durationMs: role === "ASSISTANT" ? 20 : null,
    createdAt: new Date()
  };
}

function job(
  mode: GoldenEvaluationJob["mode"] = "FAST_LLM_ONLY"
): GoldenEvaluationJob {
  return {
    version: 1,
    tenantId: "00000000-0000-4000-8000-000000000001",
    userId: "00000000-0000-4000-8000-000000000002",
    correlationId: "correlation-test",
    evaluationRunId: "00000000-0000-4000-8000-000000000003",
    mode
  };
}
