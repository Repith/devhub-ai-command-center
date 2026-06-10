import { z } from "zod";

import {
  EmbeddingProviderError,
  type EmbeddingInput,
  type EmbeddingProviderPort,
  type EmbeddingResult
} from "./embedding-provider.js";

const embeddingResponseSchema = z.object({
  data: z.array(
    z.object({
      embedding: z.array(z.number()),
      index: z.number().int().nonnegative().optional()
    })
  ),
  usage: z
    .object({
      prompt_tokens: z.number().int().nonnegative().optional(),
      total_tokens: z.number().int().nonnegative().optional()
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

export interface OllamaOpenAiEmbeddingProviderOptions {
  baseUrl?: string;
  apiKey?: string;
  fetch?: typeof fetch;
}

export class OllamaOpenAiEmbeddingProvider implements EmbeddingProviderPort {
  public readonly name = "ollama";

  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly request: typeof fetch;

  public constructor(options: OllamaOpenAiEmbeddingProviderOptions = {}) {
    this.baseUrl = (options.baseUrl ?? "http://localhost:11434/v1").replace(
      /\/+$/,
      ""
    );
    this.apiKey = options.apiKey ?? "ollama";
    this.request = options.fetch ?? fetch;
  }

  public async embed(input: EmbeddingInput): Promise<EmbeddingResult> {
    if (input.texts.length === 0) {
      return { model: input.model, vectors: [], usage: { inputTokens: 0 } };
    }

    const timeoutSignal = AbortSignal.timeout(input.timeoutMs);
    const signal = input.signal
      ? AbortSignal.any([input.signal, timeoutSignal])
      : timeoutSignal;

    let response: Response;
    try {
      response = await this.request(`${this.baseUrl}/embeddings`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ model: input.model, input: input.texts }),
        signal
      });
    } catch (error) {
      if (timeoutSignal.aborted && !input.signal?.aborted) {
        throw new EmbeddingProviderError(
          "EMBEDDING_TIMEOUT",
          `Ollama did not embed within ${input.timeoutMs}ms.`,
          { cause: error }
        );
      }
      throw new EmbeddingProviderError(
        "EMBEDDING_UNAVAILABLE",
        "Unable to connect to Ollama embeddings.",
        { cause: error }
      );
    }

    if (!response.ok) {
      const message = await this.readError(response);
      throw new EmbeddingProviderError(
        "EMBEDDING_REQUEST_FAILED",
        `Ollama returned HTTP ${response.status}: ${message}`
      );
    }

    const parsed = embeddingResponseSchema.safeParse(await response.json());
    if (!parsed.success) {
      throw new EmbeddingProviderError(
        "EMBEDDING_INVALID_RESPONSE",
        "Ollama returned an invalid embeddings response.",
        { cause: parsed.error }
      );
    }

    const vectors = parsed.data.data
      .toSorted((left, right) => (left.index ?? 0) - (right.index ?? 0))
      .map((item) => item.embedding);
    if (vectors.length !== input.texts.length) {
      throw new EmbeddingProviderError(
        "EMBEDDING_INVALID_RESPONSE",
        "Ollama returned a different number of embeddings than inputs."
      );
    }

    return {
      model: input.model,
      vectors,
      usage: {
        inputTokens:
          parsed.data.usage?.prompt_tokens ??
          parsed.data.usage?.total_tokens ??
          0
      }
    };
  }

  private async readError(response: Response): Promise<string> {
    const body = await response.text();
    const parsed = providerErrorSchema.safeParse(parseJson(body));
    return parsed.success
      ? (parsed.data.error.message ?? "Unknown provider error.")
      : body.slice(0, 500) || "Unknown provider error.";
  }
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}
