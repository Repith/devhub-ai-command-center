export type LlmMessageRole = "system" | "user" | "assistant";

export interface LlmMessage {
  role: LlmMessageRole;
  content: string;
}

export interface LlmChatInput {
  model: string;
  messages: readonly LlmMessage[];
  maxTokens?: number;
  timeoutMs: number;
  signal?: AbortSignal;
}

export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
}

export type LlmStreamEvent =
  | { type: "delta"; text: string }
  | {
      type: "completed";
      finishReason: string | null;
      usage: LlmUsage;
    };

export interface LlmProviderPort {
  readonly name: string;
  streamChat(input: LlmChatInput): AsyncIterable<LlmStreamEvent>;
}

export class LlmProviderError extends Error {
  public constructor(
    public readonly code: string,
    message: string,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = "LlmProviderError";
  }
}
