import { afterEach, describe, expect, it, vi } from "vitest";

import { listConversationMessages } from "../lib/conversations-api";
import { cancelRun, startRun } from "../lib/runs-api";

describe("durable run chat API helpers", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("starts chat through the durable AgentRun endpoint", async () => {
    const agentId = crypto.randomUUID();
    const runId = crypto.randomUUID();
    const conversationId = crypto.randomUUID();
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        id: runId,
        agentId,
        conversationId,
        status: "QUEUED",
        input: {
          message: "Hello durable runtime.",
          conversationId,
          retrievalLimit: 5
        },
        configSnapshot: configSnapshot(agentId),
        correlationId: crypto.randomUUID(),
        startedAt: null,
        completedAt: null,
        errorCode: null,
        errorMessage: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await startRun("access-token", agentId, {
      message: "Hello durable runtime.",
      conversationId,
      retrievalLimit: 5
    });

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/v1/agents/${agentId}/runs`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          message: "Hello durable runtime.",
          conversationId,
          retrievalLimit: 5
        })
      })
    );
  });

  it("cancels an active chat run through the run cancellation endpoint", async () => {
    const runId = crypto.randomUUID();
    const agentId = crypto.randomUUID();
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        id: runId,
        agentId,
        conversationId: crypto.randomUUID(),
        status: "CANCEL_REQUESTED",
        input: { message: "Cancel me.", retrievalLimit: 5 },
        configSnapshot: configSnapshot(agentId),
        correlationId: crypto.randomUUID(),
        startedAt: new Date().toISOString(),
        completedAt: null,
        errorCode: null,
        errorMessage: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await cancelRun("access-token", runId);

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/v1/runs/${runId}/cancel`,
      expect.objectContaining({ method: "POST" })
    );
  });

  it("recovers persisted conversation messages after run completion", async () => {
    const conversationId = crypto.randomUUID();
    const messageId = crypto.randomUUID();
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        data: [
          {
            id: messageId,
            conversationId,
            role: "ASSISTANT",
            content: "Persisted answer",
            sequence: 2,
            provider: "fake",
            model: "qwen3:8b",
            inputTokens: 3,
            outputTokens: 4,
            durationMs: 25,
            createdAt: new Date().toISOString()
          }
        ],
        page: { cursor: null, nextCursor: null, limit: 100 }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      listConversationMessages("access-token", conversationId)
    ).resolves.toMatchObject([{ id: messageId, content: "Persisted answer" }]);
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/v1/conversations/${conversationId}/messages`,
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer access-token"
        })
      })
    );
  });
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}

function configSnapshot(agentId: string) {
  return {
    agentId,
    provider: "ollama",
    model: "qwen3:8b",
    systemPrompt: "Answer carefully.",
    templateKey: null,
    maxSteps: 8,
    maxToolCalls: 4,
    maxTokens: null,
    timeoutMs: 120_000,
    enabledToolIds: [],
    knowledgeBaseIds: []
  };
}
