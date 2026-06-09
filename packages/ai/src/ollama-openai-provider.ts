import { z } from "zod";

import {
  LlmProviderError,
  type LlmChatInput,
  type LlmProviderPort,
  type LlmStreamEvent,
  type LlmUsage
} from "./llm-provider.js";

const chatChunkSchema = z.object({
  choices: z
    .array(
      z.object({
        delta: z.object({ content: z.string().optional() }).passthrough(),
        finish_reason: z.string().nullable().optional()
      })
    )
    .default([]),
  usage: z
    .object({
      prompt_tokens: z.number().int().nonnegative(),
      completion_tokens: z.number().int().nonnegative()
    })
    .optional()
});

const providerErrorSchema = z.object({
  error: z
    .object({
      message: z.string().optional()
    })
    .passthrough()
});

export interface OllamaOpenAiProviderOptions {
  baseUrl?: string;
  apiKey?: string;
  fetch?: typeof fetch;
}

export class OllamaOpenAiProvider implements LlmProviderPort {
  public readonly name = "ollama";

  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly request: typeof fetch;

  public constructor(options: OllamaOpenAiProviderOptions = {}) {
    this.baseUrl = (options.baseUrl ?? "http://localhost:11434/v1").replace(
      /\/+$/,
      ""
    );
    this.apiKey = options.apiKey ?? "ollama";
    this.request = options.fetch ?? fetch;
  }

  public async *streamChat(input: LlmChatInput): AsyncIterable<LlmStreamEvent> {
    const timeoutSignal = AbortSignal.timeout(input.timeoutMs);
    const signal = input.signal
      ? AbortSignal.any([input.signal, timeoutSignal])
      : timeoutSignal;

    let response: Response;
    try {
      response = await this.request(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: input.model,
          messages: input.messages,
          stream: true,
          stream_options: { include_usage: true },
          ...(input.maxTokens === undefined
            ? {}
            : { max_tokens: input.maxTokens })
        }),
        signal
      });
    } catch (error) {
      if (timeoutSignal.aborted && !input.signal?.aborted) {
        throw new LlmProviderError(
          "LLM_TIMEOUT",
          `Ollama did not respond within ${input.timeoutMs}ms.`,
          { cause: error }
        );
      }
      if (input.signal?.aborted) {
        throw new LlmProviderError(
          "LLM_CANCELLED",
          "The model request was cancelled.",
          { cause: error }
        );
      }
      throw new LlmProviderError(
        "LLM_UNAVAILABLE",
        "Unable to connect to Ollama.",
        { cause: error }
      );
    }

    if (!response.ok) {
      const message = await this.readError(response);
      throw new LlmProviderError(
        "LLM_REQUEST_FAILED",
        `Ollama returned HTTP ${response.status}: ${message}`
      );
    }
    if (!response.body) {
      throw new LlmProviderError(
        "LLM_INVALID_RESPONSE",
        "Ollama returned an empty streaming response."
      );
    }

    let usage: LlmUsage = { inputTokens: 0, outputTokens: 0 };
    let finishReason: string | null = null;

    for await (const data of readServerSentEvents(response.body)) {
      if (data === "[DONE]") {
        break;
      }

      const parsed = chatChunkSchema.safeParse(parseJson(data));
      if (!parsed.success) {
        throw new LlmProviderError(
          "LLM_INVALID_RESPONSE",
          "Ollama returned an invalid chat completion chunk.",
          { cause: parsed.error }
        );
      }

      if (parsed.data.usage) {
        usage = {
          inputTokens: parsed.data.usage.prompt_tokens,
          outputTokens: parsed.data.usage.completion_tokens
        };
      }

      for (const choice of parsed.data.choices) {
        if (choice.finish_reason !== undefined) {
          finishReason = choice.finish_reason;
        }
        if (choice.delta.content) {
          yield { type: "delta", text: choice.delta.content };
        }
      }
    }

    yield { type: "completed", finishReason, usage };
  }

  private async readError(response: Response): Promise<string> {
    const body = await response.text();
    const parsed = providerErrorSchema.safeParse(parseJson(body));
    return parsed.success
      ? (parsed.data.error.message ?? "Unknown provider error.")
      : body.slice(0, 500) || "Unknown provider error.";
  }
}

async function* readServerSentEvents(
  stream: ReadableStream<Uint8Array>
): AsyncIterable<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });

      const events = buffer.split(/\r?\n\r?\n/);
      buffer = events.pop() ?? "";

      for (const event of events) {
        const data = event
          .split(/\r?\n/)
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trimStart())
          .join("\n");
        if (data) {
          yield data;
        }
      }

      if (done) {
        break;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}
