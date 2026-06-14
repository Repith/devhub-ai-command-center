import { describe, expect, it } from "vitest";

import {
  API_PREFIX,
  agentDefinitionSchema,
  apiErrorSchema,
  chatStreamEventSchema,
  createChatMessageSchema,
  createAgentDefinitionSchema,
  documentStatusSchema,
  gmailDraftReviewSchema,
  gmailSearchThreadsInputSchema,
  mcpToolIdSchema,
  newsFeedSchema,
  registerSchema,
  realtimeEventSchema
} from "../src";

describe("contracts", () => {
  it("uses the versioned API prefix", () => {
    expect(API_PREFIX).toBe("/api/v1");
  });

  it("rejects open-ended document statuses", () => {
    expect(documentStatusSchema.safeParse("UNKNOWN").success).toBe(false);
  });

  it("validates the shared API error envelope", () => {
    const result = apiErrorSchema.safeParse({
      code: "DOCUMENT_NOT_FOUND",
      message: "Document was not found.",
      details: {},
      correlationId: "01JTEST"
    });

    expect(result.success).toBe(true);
  });

  it("validates versioned discriminated realtime events", () => {
    const result = realtimeEventSchema.safeParse({
      version: 1,
      type: "agent_run.status_changed",
      eventId: "9fcf5dd8-76c8-4f65-85af-3b04250cc6d4",
      occurredAt: "2026-06-09T12:00:00.000Z",
      correlationId: "01JTEST",
      tenantId: "64fe81ba-7faf-4b37-a2b8-347cd19b5550",
      payload: {
        runId: "9a50ec3e-3ba9-4775-a57f-b7c88f34a10d",
        status: "RUNNING"
      }
    });

    expect(result.success).toBe(true);
  });

  it("rejects client-provided tenant context in agent input", () => {
    const result = createAgentDefinitionSchema.safeParse({
      name: "Knowledge Assistant",
      provider: "ollama",
      model: "qwen3:8b",
      systemPrompt: "Use authorized knowledge.",
      tenantId: "64fe81ba-7faf-4b37-a2b8-347cd19b5550"
    });

    expect(result.success).toBe(false);
  });

  it("validates an agent definition response without tenant context", () => {
    const result = agentDefinitionSchema.safeParse({
      id: "64fe81ba-7faf-4b37-a2b8-347cd19b5550",
      name: "Knowledge Assistant",
      description: null,
      templateKey: "knowledge-researcher",
      templateSetup: [
        { id: "knowledge.search", label: "Knowledge search", status: "READY" }
      ],
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
    });

    expect(result.success).toBe(true);
  });

  it("rejects tenant identifiers in registration input", () => {
    const result = registerSchema.safeParse({
      email: "owner@example.com",
      password: "correct horse battery staple",
      tenantName: "Example",
      tenantId: "64fe81ba-7faf-4b37-a2b8-347cd19b5550"
    });

    expect(result.success).toBe(false);
  });

  it("validates versioned chat stream events", () => {
    const result = chatStreamEventSchema.safeParse({
      version: 1,
      type: "chat.delta",
      text: "Hello"
    });

    expect(result.success).toBe(true);
  });

  it("rejects tenant identifiers in chat input", () => {
    const result = createChatMessageSchema.safeParse({
      message: "Hello",
      tenantId: "64fe81ba-7faf-4b37-a2b8-347cd19b5550"
    });

    expect(result.success).toBe(false);
  });

  it("includes Gmail draft tools but no model-callable send tool", () => {
    expect(mcpToolIdSchema.safeParse("gmail.create_draft").success).toBe(true);
    expect(mcpToolIdSchema.safeParse("gmail.update_draft").success).toBe(true);
    expect(mcpToolIdSchema.safeParse("gmail.send").success).toBe(false);
  });

  it("validates Gmail thread search and draft review responses", () => {
    expect(
      gmailSearchThreadsInputSchema.safeParse({
        query: "from:client@example.com newer_than:7d"
      }).success
    ).toBe(true);
    expect(
      gmailDraftReviewSchema.safeParse({
        id: "64fe81ba-7faf-4b37-a2b8-347cd19b5550",
        agentRunId: null,
        threadId: "thread-1",
        gmailDraftId: "draft-1",
        to: ["client@example.com"],
        cc: [],
        subject: "Re: Update",
        body: "Thanks for the note.",
        status: "NEEDS_REVIEW",
        createdAt: "2026-06-09T12:00:00.000Z",
        updatedAt: "2026-06-09T12:00:00.000Z",
        sentAt: null
      }).success
    ).toBe(true);
  });

  it("validates tenant news feeds without tenant identifiers", () => {
    const result = newsFeedSchema.safeParse({
      id: "64fe81ba-7faf-4b37-a2b8-347cd19b5550",
      name: "AI News",
      url: "https://example.com/feed.xml",
      topic: "AI",
      enabled: true,
      lastFetchedAt: null,
      lastFetchStatus: "NEVER",
      lastFetchItemCount: null,
      lastFetchErrorCode: null,
      createdAt: "2026-06-09T12:00:00.000Z",
      updatedAt: "2026-06-09T12:00:00.000Z"
    });

    expect(result.success).toBe(true);
  });
});
