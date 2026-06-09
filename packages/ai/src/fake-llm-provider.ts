import type {
  LlmChatInput,
  LlmProviderPort,
  LlmStreamEvent,
  LlmUsage
} from "./llm-provider.js";

export interface FakeLlmResponse {
  chunks: readonly string[];
  usage?: LlmUsage;
  finishReason?: string | null;
}

export class FakeLlmProvider implements LlmProviderPort {
  public readonly name = "fake";
  public readonly requests: LlmChatInput[] = [];

  public constructor(private readonly response: FakeLlmResponse) {}

  public async *streamChat(input: LlmChatInput): AsyncIterable<LlmStreamEvent> {
    this.requests.push(input);

    for (const text of this.response.chunks) {
      if (input.signal?.aborted) {
        throw input.signal.reason;
      }
      yield { type: "delta", text };
    }

    yield {
      type: "completed",
      finishReason: this.response.finishReason ?? "stop",
      usage: this.response.usage ?? { inputTokens: 0, outputTokens: 0 }
    };
  }
}
