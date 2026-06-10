export interface EmbeddingInput {
  model: string;
  texts: readonly string[];
  timeoutMs: number;
  signal?: AbortSignal;
}

export interface EmbeddingUsage {
  inputTokens: number;
}

export interface EmbeddingResult {
  model: string;
  vectors: readonly (readonly number[])[];
  usage: EmbeddingUsage;
}

export interface EmbeddingProviderPort {
  readonly name: string;
  embed(input: EmbeddingInput): Promise<EmbeddingResult>;
}

export class EmbeddingProviderError extends Error {
  public constructor(
    public readonly code: string,
    message: string,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = "EmbeddingProviderError";
  }
}
