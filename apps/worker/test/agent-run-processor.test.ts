import { describe, expect, it } from "vitest";

import { FakeLlmProvider } from "@devhub/ai";
import type {
  AgentRunConfigSnapshot,
  AgentRunJob,
  CreateAgentRun,
  McpToolId
} from "@devhub/contracts";
import type {
  AgentRunRecord,
  AgentRunStepRecord,
  CompleteStepInput
} from "@devhub/database";
import type { TenantContext } from "@devhub/domain";
import type {
  ToolCallInput,
  ToolCallResult,
  ToolRegistryPort
} from "@devhub/mcp";

import { AgentRunProcessor } from "../src/agent-run-processor";

describe("AgentRunProcessor", () => {
  it("completes retrieval, one MCP tool call, and generation durably", async () => {
    const input: CreateAgentRun = {
      message: "Summarize workspace knowledge and the feed.",
      retrievalLimit: 3,
      rssUrl: "https://example.com/feed.xml"
    };
    const config = configSnapshot({
      enabledToolIds: ["knowledge.search", "news.fetch_rss"]
    });
    const runs = new FakeRunRepository(input, config);
    const tools = new FakeToolRegistry();
    const llmProvider = new FakeLlmProvider({
      chunks: ["Final answer"],
      usage: { inputTokens: 11, outputTokens: 7 }
    });

    await new AgentRunProcessor({ llmProvider, runs, tools }).process(job());

    expect(runs.completed).toBe(true);
    expect(runs.steps.map((step) => step.kind)).toEqual([
      "rag.retrieve",
      "mcp.news",
      "llm.generate"
    ]);
    expect(tools.calls.map((call) => call.toolId)).toEqual([
      "knowledge.search",
      "news.fetch_rss"
    ]);
    expect(llmProvider.requests[0]?.messages.at(-1)?.content).toContain(
      "Untrusted tool and retrieval context"
    );
    expect(runs.usages).toEqual([
      expect.objectContaining({
        provider: "fake",
        model: config.model,
        inputTokens: 11,
        outputTokens: 7
      })
    ]);
  });

  it("does not duplicate completed steps during retry", async () => {
    const input: CreateAgentRun = {
      message: "Retry safely.",
      retrievalLimit: 5,
      rssUrl: "https://example.com/feed.xml"
    };
    const config = configSnapshot({
      enabledToolIds: ["knowledge.search", "news.fetch_rss"]
    });
    const runs = new FakeRunRepository(input, config);
    runs.seedCompletedSteps();
    const tools = new FakeToolRegistry();
    const llmProvider = new FakeLlmProvider({ chunks: ["Should not run"] });

    await new AgentRunProcessor({ llmProvider, runs, tools }).process(job());

    expect(runs.completed).toBe(true);
    expect(tools.calls).toHaveLength(0);
    expect(llmProvider.requests).toHaveLength(0);
  });
});

class FakeRunRepository {
  public readonly steps: AgentRunStepRecord[] = [];
  public readonly usages: CompleteStepInput[] = [];
  public completed = false;

  public constructor(
    private readonly input: CreateAgentRun,
    private readonly config: AgentRunConfigSnapshot
  ) {}

  public markRunning(): Promise<AgentRunRecord> {
    return Promise.resolve(runRecord(this.input, this.config));
  }

  public isCancellationRequested(): Promise<boolean> {
    return Promise.resolve(false);
  }

  public markCompleted(): Promise<AgentRunRecord> {
    this.completed = true;
    return Promise.resolve(runRecord(this.input, this.config, "COMPLETED"));
  }

  public markCancelled(): Promise<AgentRunRecord> {
    return Promise.resolve(runRecord(this.input, this.config, "CANCELLED"));
  }

  public markTimedOut(): Promise<AgentRunRecord> {
    return Promise.resolve(runRecord(this.input, this.config, "TIMED_OUT"));
  }

  public markFailed(): Promise<AgentRunRecord> {
    return Promise.resolve(runRecord(this.input, this.config, "FAILED"));
  }

  public findById(): Promise<AgentRunRecord> {
    return Promise.resolve(runRecord(this.input, this.config));
  }

  public startStep(
    _context: TenantContext,
    _runId: string,
    sequence: number,
    kind: string,
    inputPreview: string
  ): Promise<AgentRunStepRecord> {
    const existing = this.steps.find((step) => step.sequence === sequence);
    if (existing) {
      return Promise.resolve(existing);
    }
    const step = stepRecord(sequence, kind, "RUNNING", inputPreview);
    this.steps.push(step);
    return Promise.resolve(step);
  }

  public completeStep(
    _context: TenantContext,
    stepId: string,
    input: CompleteStepInput
  ): Promise<AgentRunStepRecord> {
    const step = this.findStep(stepId);
    if (input.provider) {
      this.usages.push(input);
    }
    step.status = "COMPLETED";
    step.outputPreview = input.outputPreview;
    return Promise.resolve(step);
  }

  public skipStep(
    _context: TenantContext,
    stepId: string,
    outputPreview: string
  ): Promise<AgentRunStepRecord> {
    const step = this.findStep(stepId);
    step.status = "SKIPPED";
    step.outputPreview = outputPreview;
    return Promise.resolve(step);
  }

  public failStep(
    _context: TenantContext,
    stepId: string,
    code: string,
    message: string
  ): Promise<AgentRunStepRecord> {
    const step = this.findStep(stepId);
    step.status = "FAILED";
    step.errorCode = code;
    step.errorMessage = message;
    return Promise.resolve(step);
  }

  public seedCompletedSteps(): void {
    this.steps.push(
      stepRecord(1, "rag.retrieve", "COMPLETED", "Retry safely."),
      stepRecord(2, "mcp.news", "COMPLETED", "https://example.com/feed.xml"),
      stepRecord(3, "llm.generate", "COMPLETED", "Retry safely.")
    );
  }

  private findStep(stepId: string): AgentRunStepRecord {
    const step = this.steps.find((item) => item.id === stepId);
    if (!step) {
      throw new Error(`Step ${stepId} was not created.`);
    }
    return step;
  }
}

class FakeToolRegistry implements ToolRegistryPort {
  public readonly calls: ToolCallInput[] = [];

  public list(): readonly McpToolId[] {
    return ["knowledge.search", "news.fetch_rss"];
  }

  public call<TOutput>(input: ToolCallInput): Promise<ToolCallResult<TOutput>> {
    this.calls.push(input);
    return Promise.resolve({
      output: { ok: true } as TOutput,
      outputPreview: `${input.toolId} output`
    });
  }
}

function job(): AgentRunJob {
  return {
    version: 1,
    tenantId: "00000000-0000-4000-8000-000000000001",
    userId: "00000000-0000-4000-8000-000000000002",
    correlationId: "correlation-test",
    runId: "00000000-0000-4000-8000-000000000003"
  };
}

function configSnapshot(input: {
  enabledToolIds: readonly string[];
}): AgentRunConfigSnapshot {
  return {
    agentId: "00000000-0000-4000-8000-000000000004",
    provider: "ollama",
    model: "qwen3:8b",
    systemPrompt: "Answer carefully.",
    maxSteps: 8,
    maxToolCalls: 4,
    maxTokens: null,
    timeoutMs: 120_000,
    enabledToolIds: [...input.enabledToolIds],
    knowledgeBaseIds: []
  };
}

function runRecord(
  input: CreateAgentRun,
  config: AgentRunConfigSnapshot,
  status: AgentRunRecord["status"] = "RUNNING"
): AgentRunRecord {
  const now = new Date();
  return {
    id: job().runId,
    tenantId: job().tenantId,
    agentId: config.agentId,
    conversationId: input.conversationId ?? null,
    status,
    input,
    configSnapshot: config,
    correlationId: job().correlationId,
    startedAt: now,
    completedAt: status === "RUNNING" ? null : now,
    errorCode: null,
    errorMessage: null,
    createdAt: now,
    updatedAt: now
  };
}

function stepRecord(
  sequence: number,
  kind: string,
  status: AgentRunStepRecord["status"],
  inputPreview: string
): AgentRunStepRecord {
  const now = new Date();
  return {
    id: `00000000-0000-4000-8000-00000000000${sequence}`,
    tenantId: job().tenantId,
    agentRunId: job().runId,
    sequence,
    kind,
    status,
    inputPreview,
    outputPreview: status === "COMPLETED" ? `${kind} previous output` : null,
    durationMs: null,
    errorCode: null,
    errorMessage: null,
    startedAt: now,
    completedAt: status === "RUNNING" ? null : now,
    createdAt: now,
    updatedAt: now
  };
}
