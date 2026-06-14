import { END } from "@langchain/langgraph";
import { describe, expect, it, vi } from "vitest";

import type { AgentRunConfigSnapshot, CreateAgentRun } from "@devhub/contracts";
import type { TenantContext } from "@devhub/domain";

import {
  initialGraphState,
  type AgentRunGraphStateValue
} from "../src/agent-graph/agent-graph-state";
import {
  shouldContinueAfterLoad,
  shouldCreateGmailDraftReview,
  shouldSummarizeUsage
} from "../src/agent-graph/agent-run-graph";
import type { AgentStepRunner } from "../src/agent-graph/agent-step-runner";
import { completeRunNode } from "../src/agent-graph/nodes/complete-run.node";
import { createGmailDraftReviewNode } from "../src/agent-graph/nodes/create-gmail-draft-review.node";
import { fetchNewsNode } from "../src/agent-graph/nodes/fetch-news.node";
import { generateAnswerNode } from "../src/agent-graph/nodes/generate-answer.node";
import { loadRunNode } from "../src/agent-graph/nodes/load-run.node";
import { retrieveKnowledgeNode } from "../src/agent-graph/nodes/retrieve-knowledge.node";
import { summarizeUsageNode } from "../src/agent-graph/nodes/summarize-usage.node";

describe("agent graph state", () => {
  it("creates transient runtime state for a run invocation", () => {
    expect(initialGraphState({ context: context(), runId: "run-1" })).toEqual({
      config: undefined,
      context: context(),
      finalAnswer: undefined,
      gmailThread: undefined,
      input: undefined,
      outputs: [],
      runId: "run-1",
      shouldStop: false,
      signal: undefined,
      tokens: 0,
      toolCalls: 0
    });
  });
});

describe("agent graph routers", () => {
  it("stops after load when the run is missing", () => {
    expect(shouldContinueAfterLoad(state({ shouldStop: true }))).toBe(END);
  });

  it("continues after a loaded run", () => {
    expect(shouldContinueAfterLoad(state({ shouldStop: false }))).toBe(
      "retrieveKnowledge"
    );
  });

  it("routes through usage summary only when the tool is enabled", () => {
    expect(
      shouldSummarizeUsage(
        state({ config: configSnapshot({ enabledToolIds: ["usage.summary"] }) })
      )
    ).toBe("summarizeUsage");
    expect(
      shouldSummarizeUsage(
        state({ config: configSnapshot({ enabledToolIds: [] }) })
      )
    ).toBe("generateAnswer");
  });

  it("creates Gmail draft reviews only for the reply template", () => {
    expect(
      shouldCreateGmailDraftReview(
        state({
          config: configSnapshot({
            enabledToolIds: ["gmail.create_draft"],
            templateKey: "gmail-reply-assistant"
          })
        })
      )
    ).toBe("createGmailDraftReview");
    expect(
      shouldCreateGmailDraftReview(
        state({ config: configSnapshot({ enabledToolIds: [] }) })
      )
    ).toBe("completeRun");
  });
});

describe("agent graph nodes", () => {
  it("delegates load run success and missing run paths", async () => {
    const runner = fakeRunner({
      loadRunNode: vi
        .fn()
        .mockResolvedValueOnce({ input: createRunInput(), shouldStop: false })
        .mockResolvedValueOnce({ shouldStop: true })
    });

    await expect(loadRunNode(runner, state())).resolves.toEqual({
      input: createRunInput(),
      shouldStop: false
    });
    await expect(loadRunNode(runner, state())).resolves.toEqual({
      shouldStop: true
    });
  });

  it("delegates retrieval, news, usage, generation, and completion nodes", async () => {
    const runner = fakeRunner({
      completeRunNode: vi.fn().mockResolvedValue({}),
      createGmailDraftReviewNode: vi
        .fn()
        .mockResolvedValue({ outputs: ["draft-review"] }),
      fetchNewsNode: vi.fn().mockResolvedValue({ outputs: ["news"] }),
      generateAnswerNode: vi.fn().mockResolvedValue({ finalAnswer: "answer" }),
      retrieveKnowledgeNode: vi
        .fn()
        .mockResolvedValue({ outputs: ["knowledge"] }),
      summarizeUsageNode: vi.fn().mockResolvedValue({ outputs: ["usage"] })
    });
    const graphState = state({
      config: configSnapshot({ enabledToolIds: ["knowledge.search"] }),
      input: createRunInput(),
      signal: AbortSignal.timeout(1_000)
    });

    await expect(retrieveKnowledgeNode(runner, graphState)).resolves.toEqual({
      outputs: ["knowledge"]
    });
    await expect(fetchNewsNode(runner, graphState)).resolves.toEqual({
      outputs: ["news"]
    });
    await expect(summarizeUsageNode(runner, graphState)).resolves.toEqual({
      outputs: ["usage"]
    });
    await expect(generateAnswerNode(runner, graphState)).resolves.toEqual({
      finalAnswer: "answer"
    });
    await expect(
      createGmailDraftReviewNode(runner, graphState)
    ).resolves.toEqual({
      outputs: ["draft-review"]
    });
    await expect(completeRunNode(runner, graphState)).resolves.toEqual({});
  });
});

function fakeRunner(
  methods: Partial<Record<keyof AgentStepRunner, unknown>>
): AgentStepRunner {
  return methods as AgentStepRunner;
}

function state(
  overrides: Partial<AgentRunGraphStateValue> = {}
): AgentRunGraphStateValue {
  return {
    ...initialGraphState({ context: context(), runId: "run-1" }),
    ...overrides
  };
}

function context(): TenantContext {
  return {
    tenantId: "00000000-0000-4000-8000-000000000001",
    userId: "00000000-0000-4000-8000-000000000002",
    correlationId: "correlation-test"
  };
}

function createRunInput(): CreateAgentRun {
  return {
    message: "Summarize this.",
    retrievalLimit: 3
  };
}

function configSnapshot(input: {
  enabledToolIds: readonly string[];
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
    maxTokens: null,
    timeoutMs: 120_000,
    enabledToolIds: [...input.enabledToolIds],
    knowledgeBaseIds: []
  };
}
