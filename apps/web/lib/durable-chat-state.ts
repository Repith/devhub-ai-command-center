import type {
  AgentRun,
  ChatUsage,
  ConversationMessage,
  RealtimeEvent
} from "@devhub/contracts";

export function isTerminalRunStatus(status: AgentRun["status"]): boolean {
  return ["COMPLETED", "FAILED", "CANCELLED", "TIMED_OUT"].includes(status);
}

export function appendTokenDelta(
  currentDraft: string,
  runId: string | null,
  event: RealtimeEvent
): string {
  if (event.type !== "agent_run.token_delta" || event.payload.runId !== runId) {
    return currentDraft;
  }
  return `${currentDraft}${event.payload.text}`;
}

export function usageFromMessages(
  messages: readonly ConversationMessage[]
): ChatUsage | undefined {
  const assistant = messages.findLast(
    (message) =>
      message.role === "ASSISTANT" &&
      message.provider &&
      message.model &&
      message.inputTokens !== null &&
      message.outputTokens !== null &&
      message.durationMs !== null
  );
  if (!assistant?.provider || !assistant.model) {
    return undefined;
  }
  return {
    provider: assistant.provider,
    model: assistant.model,
    inputTokens: assistant.inputTokens ?? 0,
    outputTokens: assistant.outputTokens ?? 0,
    durationMs: assistant.durationMs ?? 0
  };
}
