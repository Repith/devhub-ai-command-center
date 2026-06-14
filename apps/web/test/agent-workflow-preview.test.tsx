// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AgentDefinition } from "@devhub/contracts";

import { AgentWorkflowPreview } from "../components/agent-workflow-preview";
import { workflowPreviewForAgent } from "../lib/agent-workflow-preview-data";

vi.mock("@xyflow/react", () => ({
  Background: () => <div data-testid="flow-background" />,
  Controls: () => <div data-testid="flow-controls" />,
  MarkerType: { ArrowClosed: "arrowclosed" },
  ReactFlow: ({
    nodes,
    edges,
    children
  }: {
    nodes: Array<{ id: string; data: { label: string } }>;
    edges: Array<{ id: string; label?: string }>;
    children: ReactNode;
  }) => (
    <div data-testid="react-flow">
      {nodes.map((node) => (
        <div data-testid="flow-node" key={node.id}>
          {node.data.label}
        </div>
      ))}
      {edges.map((edge) => (
        <div data-testid="flow-edge" key={edge.id}>
          {edge.label ?? "always"}
        </div>
      ))}
      {children}
    </div>
  )
}));

afterEach(cleanup);

describe("AgentWorkflowPreview", () => {
  it("renders expected nodes for the Knowledge Researcher template", () => {
    render(<AgentWorkflowPreview agent={agent("knowledge-researcher")} />);

    expect(screen.getByText("Knowledge Researcher workflow")).toBeVisible();
    expect(screen.getAllByText("Retrieve knowledge")[0]).toBeVisible();
    expect(screen.getAllByText("Generate answer")[0]).toBeVisible();
    expect(screen.getAllByText("Complete")[0]).toBeVisible();
  });

  it("renders expected conditional edge labels", () => {
    render(<AgentWorkflowPreview agent={agent("daily-news-briefing")} />);

    expect(screen.getAllByText("if rssUrl exists")[0]).toBeVisible();
    expect(screen.getAllByText("if enabled feeds exist")[0]).toBeVisible();
    expect(screen.getAllByText("on failure")[0]).toBeVisible();
  });

  it("falls back to a knowledge graph for custom agents with knowledge search", () => {
    const graph = workflowPreviewForAgent(
      agent(null, { enabledToolIds: ["knowledge.search"] })
    );

    expect(graph?.title).toBe("Knowledge workflow");
    expect(graph?.nodes.map((node) => node.label)).toEqual([
      "Start",
      "Retrieve knowledge",
      "Generate answer",
      "Complete"
    ]);
  });

  it("returns an empty state for agents without a known workflow path", () => {
    render(<AgentWorkflowPreview agent={agent(null)} />);

    expect(
      screen.getByText("No workflow preview is available for this agent yet.")
    ).toBeVisible();
    expect(workflowPreviewForAgent(agent(null))).toBeNull();
  });

  it("renders loading and error states", () => {
    const { rerender } = render(
      <AgentWorkflowPreview agent={agent("usage-analyst")} status="loading" />
    );
    expect(screen.getByText("Loading workflow preview...")).toBeVisible();

    rerender(
      <AgentWorkflowPreview agent={agent("usage-analyst")} status="error" />
    );
    expect(screen.getByRole("alert")).toBeVisible();
    expect(
      screen.getByText("Workflow preview could not be loaded.")
    ).toBeVisible();
  });
});

function agent(
  templateKey: AgentDefinition["templateKey"],
  overrides: Partial<AgentDefinition> = {}
): AgentDefinition {
  return {
    id: "64fe81ba-7faf-4b37-a2b8-347cd19b5550",
    name: "Preview Agent",
    description: null,
    templateKey,
    templateSetup: [],
    workflowVersion: null,
    provider: "ollama",
    model: "qwen3:8b",
    systemPrompt: "Use authorized context.",
    maxSteps: 8,
    maxToolCalls: 4,
    maxTokens: null,
    timeoutMs: 120_000,
    enabledToolIds: [],
    knowledgeBaseIds: [],
    createdAt: "2026-06-09T12:00:00.000Z",
    updatedAt: "2026-06-09T12:00:00.000Z",
    ...overrides
  };
}
