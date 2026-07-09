// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AgentDefinition } from "@devhub/contracts";

import { AgentForm } from "../components/agent-form";

vi.mock("../components/agent-workflow-editor", () => ({
  AgentWorkflowEditor: () => <div data-testid="workflow-editor" />
}));

vi.mock("../components/agent-workflow-preview", () => ({
  AgentWorkflowPreview: () => <div data-testid="workflow-preview" />
}));

const agent: AgentDefinition = {
  id: "64fe81ba-7faf-4b37-a2b8-347cd19b5550",
  name: "Repository Researcher",
  description: null,
  templateKey: "repository-researcher",
  templateSetup: [
    {
      id: "github.installation",
      label: "GitHub installation",
      status: "READY"
    },
    {
      id: "github.repositories",
      label: "GitHub repositories",
      status: "NEEDS_SETUP"
    },
    {
      id: "github.oauth",
      label: "GitHub OAuth",
      status: "MISCONFIGURED"
    }
  ],
  workflowVersion: null,
  provider: "ollama",
  model: "qwen3:8b",
  systemPrompt: "Use authorized repositories.",
  maxSteps: 8,
  maxToolCalls: 4,
  maxTokens: null,
  timeoutMs: 120_000,
  enabledToolIds: ["github.list_repositories"],
  knowledgeBaseIds: [],
  createdAt: "2026-07-09T12:00:00.000Z",
  updatedAt: "2026-07-09T12:00:00.000Z"
};

afterEach(cleanup);

describe("AgentForm", () => {
  it("shows setup chips for ready, missing setup, and misconfigured templates", () => {
    render(
      <AgentForm
        accessToken="access-token"
        agent={agent}
        canManage
        isNew={false}
        isSaving={false}
        isDeleting={false}
        saveError={null}
        onSave={vi.fn()}
        onDelete={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByText("GitHub installation: ready")).toHaveClass("ready");
    expect(screen.getByText("GitHub repositories: setup needed")).toHaveClass(
      "needs-setup"
    );
    expect(screen.getByText("GitHub OAuth: check server config")).toHaveClass(
      "misconfigured"
    );
  });
});
