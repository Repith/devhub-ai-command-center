import { describe, expect, it } from "vitest";

import { FakeLlmProvider, type LlmProviderPort } from "@devhub/ai";
import type {
  AgentRunConfigSnapshot,
  AgentRunJob,
  AgentWorkflowDefinition,
  CreateAgentRun,
  McpToolId,
  RealtimeEvent
} from "@devhub/contracts";
import type {
  AgentRunRecord,
  AgentRunStepRecord,
  CompleteStepInput,
  ConversationMessageRecord,
  GmailDraftReviewRecord,
  NewsFeedRecord,
  RecordNewsFeedFetchInput
} from "@devhub/database";
import type { TenantContext } from "@devhub/domain";
import type {
  ToolCallInput,
  ToolCallResult,
  ToolRegistryPort
} from "@devhub/mcp";
import { ToolRegistryError } from "@devhub/mcp";

import { AgentRunProcessor } from "../src/agent-run-processor";
import type { RealtimeEventPublisher } from "../src/realtime-event-publisher";

describe("AgentRunProcessor", () => {
  it("completes retrieval, one MCP tool call, and generation durably", async () => {
    const input: CreateAgentRun = {
      message: "Summarize workspace knowledge and the feed.",
      conversationId: "00000000-0000-4000-8000-000000000201",
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
      conversations: new FakeConversationRepository(input),
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
        assistantMessage: {
          agentId: config.agentId,
          content: "Final answer",
          conversationId: input.conversationId
        },
        provider: "fake",
        model: config.model,
        inputTokens: 11,
        outputTokens: 7,
        retryCount: 0
      })
    ]);
    expect(llmProvider.requests[0]?.messages).toEqual(
      expect.arrayContaining([
        { role: "assistant", content: "Previous answer" }
      ])
    );
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

  it("uses a saved workflow definition instead of the default graph", async () => {
    const input: CreateAgentRun = {
      message: "Use the custom usage workflow.",
      retrievalLimit: 3
    };
    const config = configSnapshot({
      enabledToolIds: ["usage.summary"],
      workflowDefinition: usageWorkflow(),
      workflowVersion: 2
    });
    const runs = new FakeRunRepository(input, config);
    const tools = new FakeToolRegistry();
    const llmProvider = new FakeLlmProvider({ chunks: ["Custom answer"] });

    await new AgentRunProcessor({ llmProvider, runs, tools }).process(job());

    expect(runs.completed).toBe(true);
    expect(config.configVersion).toContain("workflow:2");
    expect(runs.steps.map((step) => step.kind)).toEqual([
      "usage.summary",
      "llm.generate"
    ]);
    expect(tools.calls.map((call) => call.toolId)).toEqual(["usage.summary"]);
  });

  it("adds authorized GitHub repository context for the repository researcher", async () => {
    const input: CreateAgentRun = {
      message: "What repositories can I inspect?",
      retrievalLimit: 3
    };
    const config = configSnapshot({
      enabledToolIds: ["github.list_repositories"],
      templateKey: "repository-researcher"
    });
    const runs = new FakeRunRepository(input, config);
    const tools = new FakeToolRegistry();
    const llmProvider = new FakeLlmProvider({ chunks: ["Repository answer"] });

    await new AgentRunProcessor({ llmProvider, runs, tools }).process(job());

    expect(runs.completed).toBe(true);
    expect(runs.steps.map((step) => step.kind)).toEqual([
      "rag.retrieve",
      "mcp.news",
      "mcp.github",
      "llm.generate"
    ]);
    expect(tools.calls.map((call) => call.toolId)).toContain(
      "github.list_repositories"
    );
    expect(llmProvider.requests[0]?.messages.at(-1)?.content).toContain(
      "octo-org/hello-world"
    );
  });

  it("fails safely when a saved workflow snapshot is invalid", async () => {
    const input: CreateAgentRun = {
      message: "Invalid workflow should not run.",
      retrievalLimit: 3
    };
    const config = {
      ...configSnapshot({ enabledToolIds: [] }),
      workflowDefinition: {
        version: 1,
        nodes: [{ id: "start", type: "start", config: {} }],
        edges: []
      }
    } as AgentRunConfigSnapshot;
    const runs = new FakeRunRepository(input, config);

    await expect(
      new AgentRunProcessor({
        llmProvider: new FakeLlmProvider({ chunks: ["Should not run"] }),
        runs,
        tools: new FakeToolRegistry()
      }).process(job())
    ).rejects.toThrow(
      "Workflow must contain at least one complete or fail node"
    );

    expect(runs.steps).toHaveLength(0);
    expect(runs.failed?.code).toBe("AGENT_RUN_FAILED");
    expect(runs.completed).toBe(false);
  });

  it("denies disabled tools referenced by a saved workflow", async () => {
    const input: CreateAgentRun = {
      message: "Try knowledge without allowlist.",
      retrievalLimit: 3
    };
    const runs = new FakeRunRepository(
      input,
      configSnapshot({
        enabledToolIds: [],
        workflowDefinition: knowledgeWorkflow(),
        workflowVersion: 3
      })
    );

    await expect(
      new AgentRunProcessor({
        llmProvider: new FakeLlmProvider({ chunks: ["Should not run"] }),
        runs,
        tools: new FakeToolRegistry()
      }).process(job())
    ).rejects.toThrow('Workflow tool "knowledge.search" is not enabled');

    expect(runs.failed?.code).toBe("DISABLED_TOOL");
    expect(runs.completed).toBe(false);
    expect(runs.steps).toHaveLength(0);
  });

  it("routes saved workflow conditions through the expected branch", async () => {
    const input: CreateAgentRun = {
      message: "Conditionally summarize usage.",
      retrievalLimit: 3
    };
    const config = configSnapshot({
      enabledToolIds: ["usage.summary"],
      workflowDefinition: conditionalUsageWorkflow(),
      workflowVersion: 4
    });
    const runs = new FakeRunRepository(input, config);
    const tools = new FakeToolRegistry();

    await new AgentRunProcessor({
      llmProvider: new FakeLlmProvider({ chunks: ["Conditional answer"] }),
      runs,
      tools
    }).process(job());

    expect(runs.steps.map((step) => step.kind)).toEqual([
      "usage.summary",
      "llm.generate"
    ]);
    expect(tools.calls.map((call) => call.toolId)).toEqual(["usage.summary"]);
  });

  it("persists terminal failure state from a saved workflow", async () => {
    const input: CreateAgentRun = {
      message: "Fail this workflow.",
      retrievalLimit: 3
    };
    const runs = new FakeRunRepository(
      input,
      configSnapshot({
        enabledToolIds: [],
        workflowDefinition: terminalFailWorkflow(),
        workflowVersion: 5
      })
    );

    await expect(
      new AgentRunProcessor({
        llmProvider: new FakeLlmProvider({ chunks: ["Should not run"] }),
        runs,
        tools: new FakeToolRegistry()
      }).process(job())
    ).rejects.toThrow("Forced workflow failure.");

    expect(runs.failed).toEqual({
      code: "UNROUTABLE_WORKFLOW",
      message: "Forced workflow failure."
    });
    expect(runs.completed).toBe(false);
  });

  it("does not duplicate completed saved workflow steps during retry", async () => {
    const input: CreateAgentRun = {
      message: "Retry custom workflow safely.",
      retrievalLimit: 5
    };
    const runs = new FakeRunRepository(
      input,
      configSnapshot({
        enabledToolIds: ["knowledge.search"],
        workflowDefinition: knowledgeWorkflow(),
        workflowVersion: 6
      })
    );
    runs.seedCompletedSavedWorkflowSteps();
    const tools = new FakeToolRegistry();
    const llmProvider = new FakeLlmProvider({ chunks: ["Should not run"] });

    await new AgentRunProcessor({ llmProvider, runs, tools }).process(job());

    expect(runs.completed).toBe(true);
    expect(runs.steps.map((step) => step.kind)).toEqual([
      "rag.retrieve",
      "llm.generate"
    ]);
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
    expect(runs.assistantMessages).toHaveLength(0);
    expect(publisher.events.at(-1)).toMatchObject({
      type: "agent_run.status_changed",
      payload: {
        status: "FAILED",
        errorCode: "TOKEN_BUDGET_EXCEEDED"
      }
    });
  });

  it("does not persist an assistant message when generation fails", async () => {
    const input: CreateAgentRun = {
      message: "This will fail.",
      conversationId: "00000000-0000-4000-8000-000000000201",
      retrievalLimit: 5
    };
    const runs = new FakeRunRepository(
      input,
      configSnapshot({ enabledToolIds: [] })
    );

    await expect(
      new AgentRunProcessor({
        conversations: new FakeConversationRepository(input),
        llmProvider: new FailingLlmProvider(),
        runs,
        tools: new FakeToolRegistry()
      }).process(job())
    ).rejects.toThrow("Synthetic model failure");

    expect(runs.failed?.code).toBe("AGENT_RUN_FAILED");
    expect(runs.assistantMessages).toHaveLength(0);
  });

  it("does not persist an assistant message when cancellation is requested", async () => {
    const input: CreateAgentRun = {
      message: "Cancel before side effects.",
      conversationId: "00000000-0000-4000-8000-000000000201",
      retrievalLimit: 5
    };
    const runs = new FakeRunRepository(
      input,
      configSnapshot({ enabledToolIds: [] })
    );
    runs.cancelRequested = true;

    await expect(
      new AgentRunProcessor({
        conversations: new FakeConversationRepository(input),
        llmProvider: new FakeLlmProvider({ chunks: ["Should not persist"] }),
        runs,
        tools: new FakeToolRegistry()
      }).process(job())
    ).rejects.toThrow("Agent run was cancelled.");

    expect(runs.cancelled).toBe(true);
    expect(runs.assistantMessages).toHaveLength(0);
  });

  it("runs Gmail triage with bounded thread context and no draft mutation", async () => {
    const input: CreateAgentRun = {
      message: "Prioritize my inbox.",
      retrievalLimit: 3,
      gmailSearchQuery: "is:unread newer_than:2d"
    };
    const config = configSnapshot({
      enabledToolIds: ["gmail.search_threads", "gmail.get_thread"],
      maxToolCalls: 6,
      templateKey: "gmail-triage"
    });
    const runs = new FakeRunRepository(input, config);
    const tools = new FakeToolRegistry();
    const publisher = new FakeRealtimePublisher();
    const llmProvider = new FakeLlmProvider({ chunks: ["Priority summary"] });

    await new AgentRunProcessor({
      llmProvider,
      publisher,
      runs,
      tools
    }).process(job());

    expect(tools.calls.map((call) => call.toolId)).toEqual([
      "gmail.search_threads",
      "gmail.get_thread"
    ]);
    expect(tools.calls.map((call) => call.toolId)).not.toContain(
      "gmail.create_draft"
    );
    expect(tools.calls.map((call) => call.toolId)).not.toContain(
      "gmail.update_draft"
    );
    expect(llmProvider.requests[0]?.messages.at(-1)?.content).toContain(
      "SECRET_BODY"
    );
    const persistedTimeline = JSON.stringify({
      steps: runs.steps,
      events: publisher.events
    });
    expect(persistedTimeline).not.toContain("SECRET_BODY");
    expect(runs.completed).toBe(true);
  });

  it("creates a Gmail draft and local review for the reply assistant", async () => {
    const input: CreateAgentRun = {
      message: "Reply politely.",
      retrievalLimit: 3,
      gmailThreadId: "thread-1"
    };
    const config = configSnapshot({
      enabledToolIds: ["gmail.get_thread", "gmail.create_draft"],
      maxToolCalls: 6,
      templateKey: "gmail-reply-assistant"
    });
    const runs = new FakeRunRepository(input, config);
    const tools = new FakeToolRegistry();
    const draftReviews = new FakeDraftReviewRepository();
    const llmProvider = new FakeLlmProvider({ chunks: ["Draft answer"] });

    await new AgentRunProcessor({
      draftReviews,
      llmProvider,
      runs,
      tools
    }).process(job());

    expect(tools.calls.map((call) => call.toolId)).toEqual([
      "gmail.get_thread",
      "gmail.create_draft"
    ]);
    expect(tools.list({ enabledToolIds: config.enabledToolIds })).not.toContain(
      "gmail.send" as McpToolId
    );
    expect(tools.calls.at(-1)?.input).toEqual({
      threadId: "thread-1",
      to: ["sender@example.com"],
      cc: [],
      subject: "Re: Project update",
      body: "Draft answer"
    });
    expect(draftReviews.created).toEqual([
      expect.objectContaining({
        agentRunId: job().runId,
        threadId: "thread-1",
        gmailDraftId: "draft-1",
        to: ["sender@example.com"],
        body: "Draft answer"
      })
    ]);
    expect(runs.completed).toBe(true);
    expect(JSON.stringify(runs.steps)).not.toContain("SECRET_BODY");
  });

  it("updates an existing Gmail draft review target for the reply assistant", async () => {
    const input: CreateAgentRun = {
      message: "Improve the existing draft.",
      retrievalLimit: 3,
      gmailThreadId: "thread-1",
      gmailDraftReviewId: "00000000-0000-4000-8000-000000000401"
    };
    const config = configSnapshot({
      enabledToolIds: ["gmail.get_thread", "gmail.update_draft"],
      maxToolCalls: 6,
      templateKey: "gmail-reply-assistant"
    });
    const runs = new FakeRunRepository(input, config);
    const tools = new FakeToolRegistry();
    const draftReviews = new FakeDraftReviewRepository();
    draftReviews.existingGmailDraftId = "draft-existing";
    const llmProvider = new FakeLlmProvider({ chunks: ["Updated answer"] });

    await new AgentRunProcessor({
      draftReviews,
      llmProvider,
      runs,
      tools
    }).process(job());

    expect(tools.calls.map((call) => call.toolId)).toEqual([
      "gmail.get_thread",
      "gmail.update_draft"
    ]);
    expect(tools.calls.at(-1)?.input).toEqual({
      draftId: "draft-existing",
      threadId: "thread-1",
      to: ["sender@example.com"],
      cc: [],
      subject: "Re: Project update",
      body: "Updated answer"
    });
    expect(draftReviews.updated).toEqual([
      {
        id: input.gmailDraftReviewId,
        input: {
          to: ["sender@example.com"],
          cc: [],
          subject: "Re: Project update",
          body: "Updated answer"
        }
      }
    ]);
    expect(draftReviews.created).toHaveLength(0);
  });

  it("fails Gmail tool execution when the agent allowlist denies a required tool", async () => {
    const input: CreateAgentRun = {
      message: "Prioritize my inbox.",
      retrievalLimit: 3,
      gmailSearchQuery: "is:unread"
    };
    const config = configSnapshot({
      enabledToolIds: ["gmail.search_threads"],
      templateKey: "gmail-triage"
    });
    const runs = new FakeRunRepository(input, config);

    await expect(
      new AgentRunProcessor({
        llmProvider: new FakeLlmProvider({ chunks: ["Should not run"] }),
        runs,
        tools: new FakeToolRegistry()
      }).process(job())
    ).rejects.toThrow("Tool gmail.get_thread is not enabled");

    expect(runs.failed?.code).toBe("TOOL_NOT_ALLOWED");
    expect(runs.completed).toBe(false);
  });
});

class FakeRunRepository {
  public readonly steps: AgentRunStepRecord[] = [];
  public readonly usages: CompleteStepInput[] = [];
  public readonly assistantMessages: NonNullable<
    CompleteStepInput["assistantMessage"]
  >[] = [];
  public cancelRequested = false;
  public cancelled = false;
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
    return Promise.resolve(this.cancelRequested);
  }

  public markCompleted(): Promise<AgentRunRecord> {
    this.completed = true;
    return Promise.resolve(runRecord(this.input, this.config, "COMPLETED"));
  }

  public markCancelled(): Promise<AgentRunRecord> {
    this.cancelled = true;
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
    if (input.assistantMessage) {
      this.assistantMessages.push(input.assistantMessage);
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

  public seedCompletedSavedWorkflowSteps(): void {
    this.steps.push(
      stepRecord(
        1,
        "rag.retrieve",
        "COMPLETED",
        "Retry custom workflow safely."
      ),
      stepRecord(
        3,
        "llm.generate",
        "COMPLETED",
        "Retry custom workflow safely."
      )
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

class FakeConversationRepository {
  public constructor(private readonly input: CreateAgentRun) {}

  public listMessages(): Promise<ConversationMessageRecord[]> {
    return Promise.resolve([
      messageRecord("USER", "Previous question", 1),
      messageRecord("ASSISTANT", "Previous answer", 2),
      messageRecord("USER", this.input.message, 3)
    ]);
  }
}

class FailingLlmProvider implements LlmProviderPort {
  public readonly name = "failing-fake";

  public streamChat(): AsyncIterable<never> {
    throw new Error("Synthetic model failure");
  }
}

class FakeToolRegistry implements ToolRegistryPort {
  public readonly calls: ToolCallInput[] = [];

  public list(
    agent: Pick<ToolCallInput["agent"], "enabledToolIds">
  ): readonly McpToolId[] {
    const registered: readonly McpToolId[] = [
      "knowledge.search",
      "news.fetch_rss",
      "usage.summary",
      "gmail.search_threads",
      "gmail.get_thread",
      "gmail.create_draft",
      "gmail.update_draft",
      "github.list_repositories",
      "github.get_file",
      "github.search_code",
      "github.list_issues",
      "github.list_pull_requests",
      "github.get_pull_request"
    ];
    return agent.enabledToolIds.filter((toolId): toolId is McpToolId =>
      registered.includes(toolId as McpToolId)
    );
  }

  public call<TOutput>(input: ToolCallInput): Promise<ToolCallResult<TOutput>> {
    if (!input.agent.enabledToolIds.includes(input.toolId)) {
      throw new ToolRegistryError(
        "TOOL_NOT_ALLOWED",
        `Tool ${input.toolId} is not enabled for this agent.`
      );
    }
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
    if (input.toolId === "gmail.search_threads") {
      return Promise.resolve({
        output: {
          threads: [
            {
              id: "thread-1",
              snippet: "Inbox preview",
              historyId: "history-1"
            }
          ]
        } as TOutput,
        outputPreview: "gmail.search_threads output"
      });
    }
    if (input.toolId === "gmail.get_thread") {
      return Promise.resolve({
        output: gmailThreadOutput() as TOutput,
        outputPreview: "gmail.get_thread output includes SECRET_BODY"
      });
    }
    if (input.toolId === "gmail.create_draft") {
      return Promise.resolve({
        output: {
          draftId: "draft-1",
          messageId: null,
          threadId: "thread-1"
        } as TOutput,
        outputPreview: "gmail.create_draft output"
      });
    }
    if (input.toolId === "gmail.update_draft") {
      return Promise.resolve({
        output: {
          draftId: "draft-1",
          messageId: null,
          threadId: "thread-1"
        } as TOutput,
        outputPreview: "gmail.update_draft output"
      });
    }
    if (input.toolId === "github.list_repositories") {
      return Promise.resolve({
        output: {
          repositories: [
            {
              fullName: "octo-org/hello-world",
              owner: "octo-org",
              name: "hello-world",
              private: false,
              defaultBranch: "main",
              htmlUrl: "https://github.com/octo-org/hello-world"
            }
          ]
        } as TOutput,
        outputPreview: "github.list_repositories output"
      });
    }
    return Promise.resolve({
      output: { ok: true } as TOutput,
      outputPreview: `${input.toolId} output`
    });
  }
}

class FakeDraftReviewRepository {
  public readonly created: {
    agentRunId?: string;
    threadId?: string;
    gmailDraftId?: string;
    to: string[];
    cc: string[];
    subject: string;
    body: string;
  }[] = [];
  public readonly updated: {
    id: string;
    input: {
      to: string[];
      cc: string[];
      subject: string;
      body: string;
    };
  }[] = [];
  public existingGmailDraftId: string | null = null;

  public create(
    _context: TenantContext,
    input: {
      agentRunId?: string;
      threadId?: string;
      gmailDraftId?: string;
      to: string[];
      cc: string[];
      subject: string;
      body: string;
    }
  ): Promise<GmailDraftReviewRecord> {
    this.created.push(input);
    const now = new Date();
    return Promise.resolve({
      id: "00000000-0000-4000-8000-000000000401",
      tenantId: job().tenantId,
      userId: job().userId,
      agentRunId: input.agentRunId ?? null,
      threadId: input.threadId ?? null,
      gmailDraftId: input.gmailDraftId ?? null,
      to: input.to,
      cc: input.cc,
      subject: input.subject,
      body: input.body,
      status: "NEEDS_REVIEW",
      createdAt: now,
      updatedAt: now,
      sentAt: null
    });
  }

  public findById(
    _context: TenantContext,
    id: string
  ): Promise<GmailDraftReviewRecord | null> {
    if (!this.existingGmailDraftId) {
      return Promise.resolve(null);
    }
    return Promise.resolve(
      gmailDraftReviewRecord({
        id,
        gmailDraftId: this.existingGmailDraftId
      })
    );
  }

  public update(
    _context: TenantContext,
    id: string,
    input: {
      to?: string[];
      cc?: string[];
      subject?: string;
      body?: string;
    }
  ): Promise<GmailDraftReviewRecord | null> {
    this.updated.push({
      id,
      input: {
        to: input.to ?? [],
        cc: input.cc ?? [],
        subject: input.subject ?? "",
        body: input.body ?? ""
      }
    });
    return Promise.resolve(
      gmailDraftReviewRecord({
        id,
        gmailDraftId: this.existingGmailDraftId,
        to: input.to ?? [],
        cc: input.cc ?? [],
        subject: input.subject ?? "",
        body: input.body ?? "",
        status: "UPDATED"
      })
    );
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
  maxToolCalls?: number;
  maxTokens?: number | null;
  templateKey?: AgentRunConfigSnapshot["templateKey"];
  workflowDefinition?: AgentWorkflowDefinition | null;
  workflowVersion?: number | null;
}): AgentRunConfigSnapshot {
  const workflowVersion = input.workflowVersion ?? null;
  return {
    agentId: "00000000-0000-4000-8000-000000000004",
    provider: "ollama",
    model: "qwen3:8b",
    systemPrompt: "Answer carefully.",
    templateKey: input.templateKey ?? null,
    maxSteps: 8,
    maxToolCalls: input.maxToolCalls ?? 4,
    maxTokens: input.maxTokens ?? null,
    timeoutMs: 120_000,
    enabledToolIds: [...input.enabledToolIds],
    knowledgeBaseIds: [],
    configVersion: `agent:2026-06-15T00:00:00.000Z:workflow:${workflowVersion ?? "default"}`,
    workflowVersion,
    workflowDefinition: input.workflowDefinition ?? null
  };
}

function knowledgeWorkflow(): AgentWorkflowDefinition {
  return {
    version: 1,
    nodes: [
      { id: "start", type: "start", label: "Start", config: {} },
      {
        id: "retrieve",
        type: "knowledge.search",
        label: "Retrieve knowledge",
        config: { documentIds: [], limit: 5, query: "run.message" }
      },
      {
        id: "generate",
        type: "llm.generate",
        label: "Generate",
        config: { includePreviousOutputs: true, prompt: "agent.systemPrompt" }
      },
      {
        id: "complete",
        type: "complete",
        label: "Complete",
        config: { output: "previous.output" }
      }
    ],
    edges: [
      { id: "start-retrieve", sourceNodeId: "start", targetNodeId: "retrieve" },
      {
        id: "retrieve-generate",
        sourceNodeId: "retrieve",
        targetNodeId: "generate"
      },
      {
        id: "generate-complete",
        sourceNodeId: "generate",
        targetNodeId: "complete"
      }
    ]
  };
}

function usageWorkflow(): AgentWorkflowDefinition {
  return {
    version: 1,
    nodes: [
      { id: "start", type: "start", label: "Start", config: {} },
      {
        id: "usage",
        type: "usage.summary",
        label: "Usage",
        config: { period: "30d" }
      },
      {
        id: "generate",
        type: "llm.generate",
        label: "Generate",
        config: { includePreviousOutputs: true, prompt: "agent.systemPrompt" }
      },
      {
        id: "complete",
        type: "complete",
        label: "Complete",
        config: { output: "previous.output" }
      }
    ],
    edges: [
      { id: "start-usage", sourceNodeId: "start", targetNodeId: "usage" },
      { id: "usage-generate", sourceNodeId: "usage", targetNodeId: "generate" },
      {
        id: "generate-complete",
        sourceNodeId: "generate",
        targetNodeId: "complete"
      }
    ]
  };
}

function conditionalUsageWorkflow(): AgentWorkflowDefinition {
  return {
    version: 1,
    nodes: [
      { id: "start", type: "start", label: "Start", config: {} },
      {
        id: "condition",
        type: "condition",
        label: "Usage enabled?",
        config: { condition: { type: "tool.enabled", toolId: "usage.summary" } }
      },
      {
        id: "usage",
        type: "usage.summary",
        label: "Usage",
        config: { period: "30d" }
      },
      {
        id: "generate",
        type: "llm.generate",
        label: "Generate",
        config: { includePreviousOutputs: true, prompt: "agent.systemPrompt" }
      },
      {
        id: "complete",
        type: "complete",
        label: "Complete",
        config: { output: "previous.output" }
      }
    ],
    edges: [
      {
        id: "start-condition",
        sourceNodeId: "start",
        targetNodeId: "condition"
      },
      {
        id: "condition-usage",
        sourceNodeId: "condition",
        targetNodeId: "usage",
        condition: { type: "tool.enabled", toolId: "usage.summary" }
      },
      {
        id: "condition-generate",
        sourceNodeId: "condition",
        targetNodeId: "generate",
        condition: { type: "always" }
      },
      { id: "usage-generate", sourceNodeId: "usage", targetNodeId: "generate" },
      {
        id: "generate-complete",
        sourceNodeId: "generate",
        targetNodeId: "complete"
      }
    ]
  };
}

function terminalFailWorkflow(): AgentWorkflowDefinition {
  return {
    version: 1,
    nodes: [
      { id: "start", type: "start", label: "Start", config: {} },
      {
        id: "fail",
        type: "fail",
        label: "Fail",
        config: {
          errorCode: "WORKFLOW_FAILED",
          message: "Forced workflow failure."
        }
      }
    ],
    edges: [{ id: "start-fail", sourceNodeId: "start", targetNodeId: "fail" }]
  };
}

function gmailThreadOutput() {
  return {
    id: "thread-1",
    messages: [
      {
        id: "message-1",
        threadId: "thread-1",
        internalDate: "1710000000000",
        from: "Sender <sender@example.com>",
        to: "Me <me@example.com>",
        subject: "Project update",
        snippet: "Short snippet",
        bodyText: "SECRET_BODY: Please review the attached proposal."
      }
    ]
  };
}

function gmailDraftReviewRecord(
  input: Partial<GmailDraftReviewRecord>
): GmailDraftReviewRecord {
  const now = new Date();
  return {
    id: "00000000-0000-4000-8000-000000000401",
    tenantId: job().tenantId,
    userId: job().userId,
    agentRunId: null,
    threadId: "thread-1",
    gmailDraftId: null,
    to: ["sender@example.com"],
    cc: [],
    subject: "Re: Project update",
    body: "Draft answer",
    status: "NEEDS_REVIEW",
    createdAt: now,
    updatedAt: now,
    sentAt: null,
    ...input
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

function messageRecord(
  role: ConversationMessageRecord["role"],
  content: string,
  sequence: number
): ConversationMessageRecord {
  const now = new Date();
  return {
    id: `00000000-0000-4000-8000-00000000030${sequence}`,
    tenantId: job().tenantId,
    conversationId: "00000000-0000-4000-8000-000000000201",
    role,
    content,
    sequence,
    provider: role === "ASSISTANT" ? "fake" : null,
    model: role === "ASSISTANT" ? "qwen3:8b" : null,
    inputTokens: null,
    outputTokens: null,
    durationMs: null,
    createdAt: now
  };
}
