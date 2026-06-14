import { describe, expect, it } from "vitest";

import type { ConversationMessage, RealtimeEvent } from "@devhub/contracts";

import {
  appendTokenDelta,
  isTerminalRunStatus,
  usageFromMessages
} from "../lib/durable-chat-state";

describe("durable chat state helpers", () => {
  it("appends token deltas in order for the active run", () => {
    const runId = crypto.randomUUID();
    const stepId = crypto.randomUUID();

    const first = appendTokenDelta("", runId, tokenDelta(runId, stepId, "Hel"));
    const second = appendTokenDelta(
      first,
      runId,
      tokenDelta(runId, stepId, "lo")
    );

    expect(second).toBe("Hello");
  });

  it("ignores token deltas from another run", () => {
    expect(
      appendTokenDelta(
        "Current",
        crypto.randomUUID(),
        tokenDelta(crypto.randomUUID(), crypto.randomUUID(), " foreign")
      )
    ).toBe("Current");
  });

  it("identifies terminal run states", () => {
    expect(isTerminalRunStatus("COMPLETED")).toBe(true);
    expect(isTerminalRunStatus("FAILED")).toBe(true);
    expect(isTerminalRunStatus("CANCELLED")).toBe(true);
    expect(isTerminalRunStatus("TIMED_OUT")).toBe(true);
    expect(isTerminalRunStatus("RUNNING")).toBe(false);
  });

  it("derives visible usage from the latest persisted assistant message", () => {
    expect(
      usageFromMessages([
        message("ASSISTANT", "First", 1, {
          inputTokens: 1,
          outputTokens: 2
        }),
        message("ASSISTANT", "Second", 2, {
          inputTokens: 3,
          outputTokens: 4
        })
      ])
    ).toEqual({
      provider: "fake",
      model: "qwen3:8b",
      inputTokens: 3,
      outputTokens: 4,
      durationMs: 25
    });
  });
});

function tokenDelta(
  runId: string,
  stepId: string,
  text: string
): RealtimeEvent {
  return {
    version: 1,
    eventId: crypto.randomUUID(),
    occurredAt: new Date().toISOString(),
    correlationId: crypto.randomUUID(),
    tenantId: crypto.randomUUID(),
    type: "agent_run.token_delta",
    payload: { runId, stepId, text }
  };
}

function message(
  role: ConversationMessage["role"],
  content: string,
  sequence: number,
  usage?: { inputTokens: number; outputTokens: number }
): ConversationMessage {
  return {
    id: crypto.randomUUID(),
    conversationId: crypto.randomUUID(),
    role,
    content,
    sequence,
    provider: usage ? "fake" : null,
    model: usage ? "qwen3:8b" : null,
    inputTokens: usage?.inputTokens ?? null,
    outputTokens: usage?.outputTokens ?? null,
    durationMs: usage ? 25 : null,
    createdAt: new Date().toISOString()
  };
}
