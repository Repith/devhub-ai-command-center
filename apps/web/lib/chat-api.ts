import {
  chatStreamEventSchema,
  createChatMessageSchema,
  type ChatStreamEvent,
  type CreateChatMessage
} from "@devhub/contracts";

import { ApiClientError, parseApiError } from "./api-client";

export async function streamChat(
  accessToken: string,
  agentId: string,
  input: CreateChatMessage,
  onEvent: (event: ChatStreamEvent) => void,
  signal?: AbortSignal
): Promise<void> {
  const response = await fetch(`/api/v1/agents/${agentId}/chat`, {
    method: "POST",
    credentials: "include",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(createChatMessageSchema.parse(input)),
    ...(signal ? { signal } : {})
  });

  if (!response.ok) {
    throw new ApiClientError(await parseApiError(response));
  }
  if (!response.body) {
    throw new Error("The chat stream is unavailable.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      emitLine(line, onEvent);
    }
    if (done) {
      break;
    }
  }
  emitLine(buffer, onEvent);
}

function emitLine(
  line: string,
  onEvent: (event: ChatStreamEvent) => void
): void {
  const trimmed = line.trim();
  if (trimmed) {
    onEvent(chatStreamEventSchema.parse(JSON.parse(trimmed)));
  }
}
