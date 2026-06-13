// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement, type ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AgentDefinition } from "@devhub/contracts";

import { AgentList } from "../components/agent-list";

const agent: AgentDefinition = {
  id: "64fe81ba-7faf-4b37-a2b8-347cd19b5550",
  name: "Knowledge Assistant",
  description: null,
  templateKey: null,
  templateSetup: [],
  provider: "ollama",
  model: "qwen3:8b",
  systemPrompt: "Use authorized knowledge.",
  maxSteps: 8,
  maxToolCalls: 4,
  maxTokens: null,
  timeoutMs: 120_000,
  enabledToolIds: [],
  knowledgeBaseIds: [],
  createdAt: "2026-06-09T12:00:00.000Z",
  updatedAt: "2026-06-09T12:00:00.000Z"
};

afterEach(cleanup);

describe("AgentList", () => {
  it("announces the loading state", () => {
    renderList({ status: "loading" });

    expect(screen.getByText("Loading agent definitions…")).toBeVisible();
  });

  it("offers an empty-state action to managers", () => {
    const onCreate = vi.fn();
    renderList({ onCreate });

    const createButtons = screen.getAllByRole("button", {
      name: "Create agent"
    });
    fireEvent.click(createButtons[1]!);
    expect(onCreate).toHaveBeenCalledOnce();
  });

  it("shows a retry action after a loading error", () => {
    const onRetry = vi.fn();
    renderList({ status: "error", onRetry });

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("keeps member access read-only", () => {
    renderList({ canManage: false });

    expect(
      screen.getByText("An owner or admin can create agent definitions.")
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Create agent" })
    ).not.toBeInTheDocument();
  });

  it("selects an available agent", () => {
    const onSelect = vi.fn();
    renderList({ agents: [agent], onSelect });

    fireEvent.click(
      screen.getByRole("button", { name: /Knowledge Assistant/i })
    );
    expect(onSelect).toHaveBeenCalledWith(agent.id);
  });

  it("shows setup state for template agents", () => {
    renderList({
      agents: [
        {
          ...agent,
          templateKey: "gmail-reply-assistant",
          templateSetup: [
            {
              id: "gmail.oauth",
              label: "Gmail connection",
              status: "NEEDS_SETUP"
            }
          ]
        }
      ]
    });

    expect(screen.getByText("Template - setup needed")).toBeVisible();
  });
});

function renderList(
  overrides: Partial<ComponentProps<typeof AgentList>> = {}
): void {
  render(
    createElement(AgentList, {
      agents: [],
      status: "success",
      selectedId: null,
      canManage: true,
      onSelect: vi.fn(),
      onCreate: vi.fn(),
      onRetry: vi.fn(),
      ...overrides
    })
  );
}
