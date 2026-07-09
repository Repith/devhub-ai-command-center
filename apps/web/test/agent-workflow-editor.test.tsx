// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  AgentDefinition,
  AgentWorkflowDefinition,
  AgentWorkflowResponse,
  AgentWorkflowValidationResponse
} from "@devhub/contracts";

import { AgentWorkflowEditor } from "../components/agent-workflow-editor";
import {
  getAgentWorkflow,
  saveAgentWorkflow,
  validateAgentWorkflow
} from "../lib/agents-api";

vi.mock("@xyflow/react", async () => {
  const React = await import("react");
  return {
    Background: () => <div data-testid="flow-background" />,
    ConnectionMode: { Loose: "loose" },
    Controls: () => <div data-testid="flow-controls" />,
    MarkerType: { ArrowClosed: "arrowclosed" },
    Position: { Left: "left", Right: "right" },
    addEdge: (edge: unknown, edges: unknown[]) => [...edges, edge],
    useEdgesState: (initial: unknown[]) => {
      const [edges, setEdges] = React.useState(initial);
      return [edges, setEdges, vi.fn()];
    },
    useNodesState: (initial: unknown[]) => {
      const [nodes, setNodes] = React.useState(initial);
      return [nodes, setNodes, vi.fn()];
    },
    ReactFlow: ({
      nodes,
      edges,
      children,
      onConnect,
      onReconnect,
      onNodeDragStop,
      onNodeClick,
      onEdgeClick
    }: {
      nodes: Array<{
        id: string;
        data: { label: string };
        position?: { x: number; y: number };
      }>;
      edges: Array<{ id: string; label?: string }>;
      children: ReactNode;
      onConnect(connection: { source: string; target: string }): void;
      onReconnect(
        edge: { id: string },
        connection: { source: string; target: string }
      ): void;
      onNodeDragStop(
        event: unknown,
        node: { id: string; position: { x: number; y: number } }
      ): void;
      onNodeClick(event: unknown, node: { id: string }): void;
      onEdgeClick(event: unknown, edge: { id: string }): void;
    }) => (
      <div data-testid="react-flow">
        {nodes.map((node) => (
          <button
            key={node.id}
            type="button"
            onClick={() => onNodeClick({}, node)}
          >
            {node.data.label}
          </button>
        ))}
        {edges.map((edge) => (
          <button
            key={edge.id}
            type="button"
            onClick={() => onEdgeClick({}, edge)}
          >
            {edge.label ?? "always"}
          </button>
        ))}
        <button
          type="button"
          onClick={() =>
            onConnect({
              source: nodes[0]?.id ?? "start",
              target: nodes[nodes.length - 1]?.id ?? "complete"
            })
          }
        >
          Connect first to last
        </button>
        <button
          type="button"
          onClick={() =>
            onConnect({
              source: nodes[nodes.length - 1]?.id ?? "complete",
              target: nodes[0]?.id ?? "start"
            })
          }
        >
          Connect last to first
        </button>
        <button
          type="button"
          onClick={() =>
            edges[0] && nodes[0] && nodes[nodes.length - 1]
              ? onReconnect(edges[0], {
                  source: nodes[0].id,
                  target: nodes[nodes.length - 1]!.id
                })
              : undefined
          }
        >
          Reconnect first edge to last
        </button>
        <button
          type="button"
          onClick={() =>
            nodes[0]
              ? onNodeDragStop(
                  {},
                  {
                    id: nodes[0].id,
                    position: { x: 123, y: 456 }
                  }
                )
              : undefined
          }
        >
          Drag first node
        </button>
        {children}
      </div>
    )
  };
});

vi.mock("../lib/agents-api", () => ({
  getAgentWorkflow: vi.fn(),
  saveAgentWorkflow: vi.fn(),
  validateAgentWorkflow: vi.fn()
}));

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe("AgentWorkflowEditor", () => {
  it("adds, connects, configures, validates, saves, and resets workflow nodes", async () => {
    vi.mocked(getAgentWorkflow).mockResolvedValue({
      definition: null,
      version: null
    } satisfies AgentWorkflowResponse);
    vi.mocked(validateAgentWorkflow).mockResolvedValue({
      valid: true,
      errors: []
    } satisfies AgentWorkflowValidationResponse);
    vi.mocked(saveAgentWorkflow).mockImplementation(
      async (_token, _agentId, definition) =>
        ({ definition, version: 1 }) satisfies AgentWorkflowResponse
    );

    renderEditor();

    expect(await screen.findByText("Retrieve knowledge")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Save workflow" })
    ).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "fail" }));
    fireEvent.change(screen.getByLabelText("Label"), {
      target: { value: "Terminal failure" }
    });
    fireEvent.change(screen.getByLabelText("Config JSON"), {
      target: {
        value: JSON.stringify({
          errorCode: "NO_PATH",
          message: "No successful workflow path."
        })
      }
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Connect first to last" })
    );
    const alwaysEdges = screen.getAllByRole("button", { name: "always" });
    fireEvent.click(alwaysEdges[alwaysEdges.length - 1]!);
    fireEvent.change(screen.getByLabelText("Condition"), {
      target: { value: "failure" }
    });

    fireEvent.click(screen.getByRole("button", { name: "Validate" }));
    await screen.findByText("Server validation passed.");
    expect(screen.getByRole("button", { name: "Save workflow" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Save workflow" }));
    await waitFor(() => expect(saveAgentWorkflow).toHaveBeenCalledOnce());
    const savedDefinition = vi.mocked(saveAgentWorkflow).mock.calls[0]?.[2] as
      | AgentWorkflowDefinition
      | undefined;
    expect(
      savedDefinition?.nodes.some((node) => node.label === "Terminal failure")
    ).toBe(true);
    expect(
      savedDefinition?.edges.some(
        (edge) => edge.condition?.type === "previousStep.failed"
      )
    ).toBe(true);

    fireEvent.click(
      screen.getByRole("button", { name: "Reset to template graph" })
    );
    expect(screen.getAllByText("Retrieve knowledge")[0]).toBeVisible();
  });

  it("deletes a selected edge without deleting its nodes", async () => {
    const definition = workflowWithRemovableEdge();
    vi.mocked(getAgentWorkflow).mockResolvedValue({
      definition,
      version: 1
    } satisfies AgentWorkflowResponse);
    vi.mocked(validateAgentWorkflow).mockResolvedValue({
      valid: true,
      errors: []
    } satisfies AgentWorkflowValidationResponse);
    vi.mocked(saveAgentWorkflow).mockImplementation(
      async (_token, _agentId, nextDefinition) =>
        ({
          definition: nextDefinition,
          version: 2
        }) satisfies AgentWorkflowResponse
    );

    renderEditor();

    fireEvent.click(await screen.findByRole("button", { name: "always" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete edge" }));
    expect(screen.getByText("Start")).toBeVisible();
    expect(screen.getByText("Complete")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Validate" }));
    await screen.findByText("Server validation passed.");
    fireEvent.click(screen.getByRole("button", { name: "Save workflow" }));

    await waitFor(() => expect(saveAgentWorkflow).toHaveBeenCalledOnce());
    const savedDefinition = vi.mocked(saveAgentWorkflow).mock.calls[0]?.[2] as
      | AgentWorkflowDefinition
      | undefined;
    expect(savedDefinition?.nodes.map((node) => node.id)).toEqual([
      "start",
      "complete"
    ]);
    expect(savedDefinition?.edges).toEqual([]);
  });

  it("persists manually dragged node positions", async () => {
    vi.mocked(getAgentWorkflow).mockResolvedValue({
      definition: workflowWithRemovableEdge(),
      version: 1
    } satisfies AgentWorkflowResponse);
    vi.mocked(validateAgentWorkflow).mockResolvedValue({
      valid: true,
      errors: []
    } satisfies AgentWorkflowValidationResponse);
    vi.mocked(saveAgentWorkflow).mockImplementation(
      async (_token, _agentId, nextDefinition) =>
        ({
          definition: nextDefinition,
          version: 2
        }) satisfies AgentWorkflowResponse
    );

    renderEditor();

    await screen.findByText("v1");

    fireEvent.click(screen.getByRole("button", { name: "Drag first node" }));
    fireEvent.click(screen.getByRole("button", { name: "Validate" }));
    await screen.findByText("Server validation passed.");
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Save workflow" })
      ).toBeEnabled()
    );
    fireEvent.click(screen.getByRole("button", { name: "Save workflow" }));

    await waitFor(() => expect(saveAgentWorkflow).toHaveBeenCalledOnce());
    const savedDefinition = vi.mocked(saveAgentWorkflow).mock.calls[0]?.[2] as
      | AgentWorkflowDefinition
      | undefined;
    expect(savedDefinition?.nodes[0]?.position).toEqual({ x: 123, y: 456 });
  });

  it("blocks invalid terminal-to-start connections before save", async () => {
    vi.mocked(getAgentWorkflow).mockResolvedValue({
      definition: workflowWithRemovableEdge(),
      version: 1
    } satisfies AgentWorkflowResponse);

    renderEditor();

    await screen.findByText("v1");
    fireEvent.click(
      screen.getByRole("button", { name: "Connect last to first" })
    );

    expect(
      screen.getByText(/Start cannot have incoming connections/)
    ).toBeVisible();
  });

  it("reconnects an existing edge without deleting it first", async () => {
    vi.mocked(getAgentWorkflow).mockResolvedValue({
      definition: workflowWithBranch(),
      version: 1
    } satisfies AgentWorkflowResponse);
    vi.mocked(validateAgentWorkflow).mockResolvedValue({
      valid: true,
      errors: []
    } satisfies AgentWorkflowValidationResponse);
    vi.mocked(saveAgentWorkflow).mockImplementation(
      async (_token, _agentId, nextDefinition) =>
        ({
          definition: nextDefinition,
          version: 2
        }) satisfies AgentWorkflowResponse
    );

    renderEditor();

    await screen.findByText("v1");
    fireEvent.click(
      screen.getByRole("button", { name: "Reconnect first edge to last" })
    );
    fireEvent.click(screen.getByRole("button", { name: "Validate" }));
    await screen.findByText("Server validation passed.");
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Save workflow" })
      ).toBeEnabled()
    );
    fireEvent.click(screen.getByRole("button", { name: "Save workflow" }));

    await waitFor(() => expect(saveAgentWorkflow).toHaveBeenCalledOnce());
    const savedDefinition = vi.mocked(saveAgentWorkflow).mock.calls[0]?.[2] as
      | AgentWorkflowDefinition
      | undefined;
    expect(savedDefinition?.edges[0]).toMatchObject({
      id: "start-to-answer",
      sourceNodeId: "start",
      targetNodeId: "complete"
    });
  });
});

function renderEditor(): void {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  });
  render(
    <QueryClientProvider client={queryClient}>
      <AgentWorkflowEditor accessToken="token" agent={agent()} canManage />
    </QueryClientProvider>
  );
}

function agent(): AgentDefinition {
  return {
    id: "64fe81ba-7faf-4b37-a2b8-347cd19b5550",
    name: "Knowledge Agent",
    description: null,
    templateKey: "knowledge-researcher",
    templateSetup: [],
    workflowVersion: null,
    provider: "ollama",
    model: "qwen3:8b",
    systemPrompt: "Use authorized context.",
    maxSteps: 8,
    maxToolCalls: 4,
    maxTokens: null,
    timeoutMs: 120_000,
    enabledToolIds: ["knowledge.search"],
    knowledgeBaseIds: [],
    createdAt: "2026-06-09T12:00:00.000Z",
    updatedAt: "2026-06-09T12:00:00.000Z"
  };
}

function workflowWithRemovableEdge(): AgentWorkflowDefinition {
  return {
    version: 1,
    nodes: [
      { id: "start", type: "start", label: "Start", config: {} },
      {
        id: "complete",
        type: "complete",
        label: "Complete",
        config: { output: "previous.output" }
      }
    ],
    edges: [
      {
        id: "start-to-complete",
        sourceNodeId: "start",
        targetNodeId: "complete",
        condition: { type: "always" }
      }
    ]
  };
}

function workflowWithBranch(): AgentWorkflowDefinition {
  return {
    version: 1,
    nodes: [
      { id: "start", type: "start", label: "Start", config: {} },
      {
        id: "answer",
        type: "llm.generate",
        label: "Answer",
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
        id: "start-to-answer",
        sourceNodeId: "start",
        targetNodeId: "answer",
        condition: { type: "always" }
      },
      {
        id: "answer-to-complete",
        sourceNodeId: "answer",
        targetNodeId: "complete",
        condition: { type: "always" }
      }
    ]
  };
}
