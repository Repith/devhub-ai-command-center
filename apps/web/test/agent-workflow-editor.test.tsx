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
    Controls: () => <div data-testid="flow-controls" />,
    MarkerType: { ArrowClosed: "arrowclosed" },
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
      onNodeClick,
      onEdgeClick
    }: {
      nodes: Array<{ id: string; data: { label: string } }>;
      edges: Array<{ id: string; label?: string }>;
      children: ReactNode;
      onConnect(connection: { source: string; target: string }): void;
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
