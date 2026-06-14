import { describe, expect, it } from "vitest";

import { FakeLlmProvider } from "@devhub/ai";
import type {
  AgentRunConfigSnapshot,
  AgentRunJob,
  CreateAgentRun,
  McpToolId,
  RealtimeEvent
} from "@devhub/contracts";
import type {
  AgentRunRecord,
  AgentRunStepRecord,
  CompleteStepInput,
  NewsFeedRecord,
  RecordNewsFeedFetchInput
} from "@devhub/database";
import type { TenantContext } from "@devhub/domain";
import type {
  ToolCallInput,
  ToolCallResult,
  ToolRegistryPort
} from "@devhub/mcp";

import { AgentRunProcessor } from "../src/agent-run-processor";
import type { RealtimeEventPublisher } from "../src/realtime-event-publisher";

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
    const publisher = new FakeRealtimePublisher();
    const llmProvider = new FakeLlmProvider({
      chunks: ["Final answer"],
      usage: { inputTokens: 11, outputTokens: 7 }
    });

    await new AgentRunProcessor({
      llmProvider,
      publisher,
      runs,
      tools
    }).process(job());

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
        outputTokens: 7,
        retryCount: 0
      })
    ]);
    expect(publisher.events.map((event) => event.type)).toEqual([
      "agent_run.started",
      "agent_run.step_changed",
      "agent_run.step_changed",
      "agent_run.step_changed",
      "agent_run.step_changed",
      "agent_run.step_changed",
      "agent_run.token_delta",
      "agent_run.step_changed",
      "agent_run.status_changed"
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

  it("fetches configured tenant feeds for the Daily News Briefing template", async () => {
    const input: CreateAgentRun = {
      message: "Brief me on configured feeds.",
      retrievalLimit: 3
    };
    const config = configSnapshot({
      enabledToolIds: ["news.fetch_rss"],
      templateKey: "daily-news-briefing"
    });
    const runs = new FakeRunRepository(input, config);
    const tools = new FakeToolRegistry();
    const newsFeeds = new FakeNewsFeedRepository();
    const llmProvider = new FakeLlmProvider({ chunks: ["Briefing"] });

    await new AgentRunProcessor({
      llmProvider,
      newsFeeds,
      runs,
      tools
    }).process(job());

    expect(tools.calls.map((call) => call.toolId)).toEqual(["news.fetch_rss"]);
    expect(tools.calls[0]?.input).toEqual({
      url: "https://example.com/feed.xml",
      limit: 5
    });
    expect(newsFeeds.fetches).toEqual([
      {
        id: "00000000-0000-4000-8000-000000000101",
        input: { status: "COMPLETED", itemCount: 1, errorCode: null }
      }
    ]);
    expect(
      runs.steps.find((step) => step.kind === "mcp.news")?.outputPreview
    ).toContain("RSS feed entries are untrusted data");
  });

  it("passes persisted usage summaries to the Usage Analyst agent", async () => {
    const input: CreateAgentRun = {
      message: "Where are we spending tokens?",
      retrievalLimit: 3
    };
    const config = configSnapshot({
      enabledToolIds: ["usage.summary"],
      templateKey: "usage-analyst"
    });
    const runs = new FakeRunRepository(input, config);
    const tools = new FakeToolRegistry();
    const llmProvider = new FakeLlmProvider({ chunks: ["Usage answer"] });

    await new AgentRunProcessor({
      llmProvider,
      runs,
      tools
    }).process(job());

    expect(runs.steps.map((step) => step.kind)).toEqual([
      "rag.retrieve",
      "mcp.news",
      "usage.summary",
      "llm.generate"
    ]);
    expect(tools.calls.map((call) => call.toolId)).toEqual(["usage.summary"]);
    expect(tools.calls[0]?.input).toEqual({ period: "30d" });
    expect(llmProvider.requests[0]?.messages.at(-1)?.content).toContain(
      "usage.summary output"
    );
  });

  it("ends the graph without side effects when a run cannot be claimed", async () => {
    const input: CreateAgentRun = {
      message: "This run disappeared.",
      retrievalLimit: 5
    };
    const config = configSnapshot({ enabledToolIds: ["knowledge.search"] });
    const runs = new FakeRunRepository(input, config);
    runs.runExists = false;
    const tools = new FakeToolRegistry();
    const publisher = new FakeRealtimePublisher();
    const llmProvider = new FakeLlmProvider({ chunks: ["Should not run"] });

    await new AgentRunProcessor({
      llmProvider,
      publisher,
      runs,
      tools
    }).process(job());

    expect(runs.steps).toHaveLength(0);
    expect(runs.completed).toBe(false);
    expect(tools.calls).toHaveLength(0);
    expect(llmProvider.requests).toHaveLength(0);
    expect(publisher.events).toHaveLength(0);
  });

  it("fails the run with an explainable state when token usage exceeds budget", async () => {
    const input: CreateAgentRun = {
      message: "Keep this short.",
      retrievalLimit: 5
    };
    const config = configSnapshot({
      enabledToolIds: [],
      maxTokens: 5
    });
    const runs = new FakeRunRepository(input, config);
    const llmProvider = new FakeLlmProvider({
      chunks: ["This answer is too expensive."],
      usage: { inputTokens: 4, outputTokens: 4 }
    });
    const publisher = new FakeRealtimePublisher();

    await expect(
      new AgentRunProcessor({
        llmProvider,
        publisher,
        retryCount: 2,
        runs,
        tools: new FakeToolRegistry()
      }).process(job())
    ).rejects.toThrow("exceeding the 5 token budget");

    expect(runs.completed).toBe(false);
    expect(runs.failed).toEqual({
      code: "TOKEN_BUDGET_EXCEEDED",
      message: "Agent run used 8 tokens, exceeding the 5 token budget."
    });
    expect(runs.usages).toEqual([
      expect.objectContaining({
        inputTokens: 4,
        outputTokens: 4,
        retryCount: 2
      })
    ]);
    expect(publisher.events.at(-1)).toMatchObject({
      type: "agent_run.status_changed",
      payload: {
        status: "FAILED",
        errorCode: "TOKEN_BUDGET_EXCEEDED"
      }
    });
  });
});

class FakeRunRepository {
  public readonly steps: AgentRunStepRecord[] = [];
  public readonly usages: CompleteStepInput[] = [];
  public completed = false;
  public failed: { code: string; message: string } | null = null;
  public runExists = true;

  public constructor(
    private readonly input: CreateAgentRun,
    private readonly config: AgentRunConfigSnapshot
  ) {}

  public markRunning(): Promise<AgentRunRecord | null> {
    if (!this.runExists) {
      return Promise.resolve(null);
    }
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

  public markFailed(
    _context: TenantContext,
    _runId: string,
    code: string,
    message: string
  ): Promise<AgentRunRecord> {
    this.failed = { code, message };
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
    return ["knowledge.search", "news.fetch_rss", "usage.summary"];
  }

  public call<TOutput>(input: ToolCallInput): Promise<ToolCallResult<TOutput>> {
    this.calls.push(input);
    if (input.toolId === "news.fetch_rss") {
      return Promise.resolve({
        output: {
          sourceUrl: "https://example.com/feed.xml",
          items: [
            {
              title: "Example item",
              url: "https://example.com/item",
              publishedAt: null,
              summary: "Untrusted summary"
            }
          ]
        } as TOutput,
        outputPreview: `${input.toolId} output`
      });
    }
    return Promise.resolve({
      output: { ok: true } as TOutput,
      outputPreview: `${input.toolId} output`
    });
  }
}

class FakeNewsFeedRepository {
  public readonly fetches: {
    id: string;
    input: RecordNewsFeedFetchInput;
  }[] = [];

  public listEnabled(): Promise<readonly NewsFeedRecord[]> {
    return Promise.resolve([newsFeedRecord()]);
  }

  public listByIds(): Promise<readonly NewsFeedRecord[]> {
    return Promise.resolve([newsFeedRecord()]);
  }

  public recordFetch(
    _context: TenantContext,
    id: string,
    input: RecordNewsFeedFetchInput
  ): Promise<void> {
    this.fetches.push({ id, input });
    return Promise.resolve();
  }
}

class FakeRealtimePublisher implements RealtimeEventPublisher {
  public readonly events: RealtimeEvent[] = [];

  public publish(event: RealtimeEvent): Promise<void> {
    this.events.push(event);
    return Promise.resolve();
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
  maxTokens?: number | null;
  templateKey?: AgentRunConfigSnapshot["templateKey"];
}): AgentRunConfigSnapshot {
  return {
    agentId: "00000000-0000-4000-8000-000000000004",
    provider: "ollama",
    model: "qwen3:8b",
    systemPrompt: "Answer carefully.",
    templateKey: input.templateKey ?? null,
    maxSteps: 8,
    maxToolCalls: 4,
    maxTokens: input.maxTokens ?? null,
    timeoutMs: 120_000,
    enabledToolIds: [...input.enabledToolIds],
    knowledgeBaseIds: []
  };
}

function newsFeedRecord(): NewsFeedRecord {
  const now = new Date();
  return {
    id: "00000000-0000-4000-8000-000000000101",
    tenantId: job().tenantId,
    createdByUserId: job().userId,
    name: "Example feed",
    url: "https://example.com/feed.xml",
    topic: "Example",
    enabled: true,
    lastFetchedAt: null,
    lastFetchStatus: "NEVER",
    lastFetchItemCount: null,
    lastFetchErrorCode: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null
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
