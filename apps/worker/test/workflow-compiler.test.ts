import { describe, expect, it, vi } from "vitest";

import type {
  AgentRunConfigSnapshot,
  AgentWorkflowDefinition,
  CreateAgentRun
} from "@devhub/contracts";
import type { TenantContext } from "@devhub/domain";

import { initialGraphState } from "../src/agent-graph/agent-graph-state";
import type { AgentStepRunner } from "../src/agent-graph/agent-step-runner";
import {
  compileAgentWorkflowDefinition,
  WorkflowCompilerError
} from "../src/agent-graph/workflow-compiler";

describe("workflow compiler", () => {
  it("compiles and invokes a simple knowledge workflow", async () => {
    const runner = fakeRunner();
    const graph = compileAgentWorkflowDefinition(knowledgeWorkflow(), runner);

    const result = await graph.invoke(
      initialGraphState({ context: context(), runId: "run-knowledge" })
    );

    expect(runner.loadRunNode).toHaveBeenCalledOnce();
    expect(runner.retrieveKnowledgeNode).toHaveBeenCalledOnce();
    expect(runner.generateAnswerNode).toHaveBeenCalledOnce();
    expect(runner.completeRunNode).toHaveBeenCalledOnce();
    expect(result.finalAnswer).toBe("compiled answer");
  });

  it("compiles a conditional RSS workflow and chooses the request URL branch", async () => {
    const runner = fakeRunner({
      input: createRunInput({ rssUrl: "https://example.com/feed.xml" })
    });
    const graph = compileAgentWorkflowDefinition(rssWorkflow(), runner);

    await graph.invoke(
      initialGraphState({ context: context(), runId: "run-rss" })
    );

    expect(runner.fetchNewsNode).toHaveBeenCalledOnce();
    expect(runner.generateAnswerNode).toHaveBeenCalledOnce();
    expect(runner.completeRunNode).toHaveBeenCalledOnce();
  });

  it("compiles a usage summary workflow", async () => {
    const runner = fakeRunner({
      config: configSnapshot({ enabledToolIds: ["usage.summary"] })
    });
    const graph = compileAgentWorkflowDefinition(usageWorkflow(), runner);

    await graph.invoke(
      initialGraphState({ context: context(), runId: "run-usage" })
    );

    expect(runner.summarizeUsageNode).toHaveBeenCalledOnce();
    expect(runner.generateAnswerNode).toHaveBeenCalledOnce();
    expect(runner.completeRunNode).toHaveBeenCalledOnce();
  });

  it("rejects unknown node and condition definitions", () => {
    expect(() =>
      compileAgentWorkflowDefinition(
        {
          ...knowledgeWorkflow(),
          nodes: [
            ...knowledgeWorkflow().nodes,
            { id: "unsafe", type: "shell.exec", config: {} }
          ]
        } as unknown as AgentWorkflowDefinition,
        fakeRunner()
      )
    ).toThrow(WorkflowCompilerError);

    expect(() =>
      compileAgentWorkflowDefinition(
        {
          ...knowledgeWorkflow(),
          edges: [
            {
              id: "unsafe-condition",
              sourceNodeId: "start",
              targetNodeId: "retrieve",
              condition: { type: "javascript", code: "eval(input)" }
            }
          ]
        } as unknown as AgentWorkflowDefinition,
        fakeRunner()
      )
    ).toThrow(WorkflowCompilerError);
  });

  it("rejects dangling edges, missing terminals, and unsupported cycles", () => {
    expect(() =>
      compileAgentWorkflowDefinition(
        {
          ...knowledgeWorkflow(),
          edges: [
            {
              id: "dangling",
              sourceNodeId: "start",
              targetNodeId: "missing"
            }
          ]
        } as AgentWorkflowDefinition,
        fakeRunner()
      )
    ).toThrow(WorkflowCompilerError);

    expect(() =>
      compileAgentWorkflowDefinition(
        {
          ...knowledgeWorkflow(),
          nodes: knowledgeWorkflow().nodes.filter(
            (node) => node.type !== "complete"
          ),
          edges: knowledgeWorkflow().edges.filter(
            (edge) => edge.targetNodeId !== "complete"
          )
        } as AgentWorkflowDefinition,
        fakeRunner()
      )
    ).toThrow(WorkflowCompilerError);

    expect(() =>
      compileAgentWorkflowDefinition(
        {
          ...knowledgeWorkflow(),
          edges: [
            ...knowledgeWorkflow().edges,
            { id: "cycle", sourceNodeId: "generate", targetNodeId: "retrieve" }
          ]
        } as AgentWorkflowDefinition,
        fakeRunner()
      )
    ).toThrow(WorkflowCompilerError);
  });

  it("does not call a disabled tool handler", async () => {
    const runner = fakeRunner({
      config: configSnapshot({ enabledToolIds: [] })
    });
    const graph = compileAgentWorkflowDefinition(knowledgeWorkflow(), runner);

    await expect(
      graph.invoke(
        initialGraphState({ context: context(), runId: "run-denied" })
      )
    ).rejects.toMatchObject({
      code: "DISABLED_TOOL"
    });
    expect(runner.retrieveKnowledgeNode).not.toHaveBeenCalled();
  });
});

function fakeRunner(
  input: {
    config?: AgentRunConfigSnapshot;
    input?: CreateAgentRun;
  } = {}
): AgentStepRunner & {
  completeRunNode: ReturnType<typeof vi.fn>;
  fetchNewsNode: ReturnType<typeof vi.fn>;
  generateAnswerNode: ReturnType<typeof vi.fn>;
  loadRunNode: ReturnType<typeof vi.fn>;
  retrieveKnowledgeNode: ReturnType<typeof vi.fn>;
  runGmailNode: ReturnType<typeof vi.fn>;
  summarizeUsageNode: ReturnType<typeof vi.fn>;
} {
  return {
    completeRunNode: vi.fn().mockResolvedValue({}),
    createGmailDraftReviewNode: vi
      .fn()
      .mockResolvedValue({ outputs: ["draft"] }),
    fetchNewsNode: vi.fn().mockResolvedValue({ outputs: ["news"] }),
    generateAnswerNode: vi
      .fn()
      .mockResolvedValue({ finalAnswer: "compiled answer" }),
    loadRunNode: vi.fn().mockResolvedValue({
      config:
        input.config ??
        configSnapshot({
          enabledToolIds: ["knowledge.search", "news.fetch_rss"]
        }),
      input: input.input ?? createRunInput(),
      shouldStop: false,
      signal: AbortSignal.timeout(1_000)
    }),
    retrieveKnowledgeNode: vi
      .fn()
      .mockResolvedValue({ outputs: ["knowledge"] }),
    runGmailNode: vi.fn().mockResolvedValue({ outputs: ["gmail"] }),
    summarizeUsageNode: vi.fn().mockResolvedValue({ outputs: ["usage"] })
  } as unknown as AgentStepRunner & {
    completeRunNode: ReturnType<typeof vi.fn>;
    fetchNewsNode: ReturnType<typeof vi.fn>;
    generateAnswerNode: ReturnType<typeof vi.fn>;
    loadRunNode: ReturnType<typeof vi.fn>;
    retrieveKnowledgeNode: ReturnType<typeof vi.fn>;
    runGmailNode: ReturnType<typeof vi.fn>;
    summarizeUsageNode: ReturnType<typeof vi.fn>;
  };
}

function knowledgeWorkflow(): AgentWorkflowDefinition {
  return {
    version: 1,
    nodes: [
      { id: "start", type: "start", config: {} },
      {
        id: "retrieve",
        type: "knowledge.search",
        config: { documentIds: [], limit: 5, query: "run.message" }
      },
      {
        id: "generate",
        type: "llm.generate",
        config: { includePreviousOutputs: true, prompt: "agent.systemPrompt" }
      },
      {
        id: "complete",
        type: "complete",
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

function rssWorkflow(): AgentWorkflowDefinition {
  return {
    version: 1,
    nodes: [
      { id: "start", type: "start", config: {} },
      {
        id: "rss-url",
        type: "condition",
        config: { condition: { type: "field.exists", field: "run.rssUrl" } }
      },
      {
        id: "fetch-news",
        type: "news.fetch_rss",
        config: { limit: 5, source: "run.rssUrl" }
      },
      {
        id: "generate",
        type: "llm.generate",
        config: { includePreviousOutputs: true, prompt: "agent.systemPrompt" }
      },
      {
        id: "complete",
        type: "complete",
        config: { output: "previous.output" }
      }
    ],
    edges: [
      { id: "start-check", sourceNodeId: "start", targetNodeId: "rss-url" },
      {
        id: "check-fetch",
        sourceNodeId: "rss-url",
        targetNodeId: "fetch-news",
        condition: { type: "field.exists", field: "run.rssUrl" }
      },
      {
        id: "fetch-generate",
        sourceNodeId: "fetch-news",
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
      { id: "start", type: "start", config: {} },
      { id: "usage", type: "usage.summary", config: { period: "30d" } },
      {
        id: "generate",
        type: "llm.generate",
        config: { includePreviousOutputs: true, prompt: "agent.systemPrompt" }
      },
      {
        id: "complete",
        type: "complete",
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

function configSnapshot(input: {
  enabledToolIds: readonly string[];
}): AgentRunConfigSnapshot {
  return {
    agentId: "00000000-0000-4000-8000-000000000004",
    provider: "ollama",
    model: "qwen3:8b",
    systemPrompt: "Answer carefully.",
    templateKey: null,
    maxSteps: 8,
    maxToolCalls: 4,
    maxTokens: null,
    timeoutMs: 120_000,
    enabledToolIds: [...input.enabledToolIds],
    knowledgeBaseIds: []
  };
}

function createRunInput(
  overrides: Partial<CreateAgentRun> = {}
): CreateAgentRun {
  return {
    message: "Summarize this.",
    retrievalLimit: 3,
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
