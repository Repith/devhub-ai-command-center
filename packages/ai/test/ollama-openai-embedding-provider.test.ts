import { describe, expect, it } from "vitest";

import { OllamaOpenAiEmbeddingProvider } from "../src";

describe("OllamaOpenAiEmbeddingProvider", () => {
  it("embeds batched inputs through the OpenAI-compatible endpoint", async () => {
    const requests: unknown[] = [];
    const provider = new OllamaOpenAiEmbeddingProvider({
      baseUrl: "http://ollama.test/v1",
      fetch: ((url, init) => {
        requests.push({ url, body: init?.body });
        return Promise.resolve(
          Response.json({
            data: [
              { index: 1, embedding: [0, 1] },
              { index: 0, embedding: [1, 0] }
            ],
            usage: { prompt_tokens: 7 }
          })
        );
      }) as typeof fetch
    });

    const result = await provider.embed({
      model: "nomic-embed-text",
      texts: ["alpha", "beta"],
      timeoutMs: 1000
    });

    expect(result).toEqual({
      model: "nomic-embed-text",
      vectors: [
        [1, 0],
        [0, 1]
      ],
      usage: { inputTokens: 7 }
    });
    expect(requests).toEqual([
      {
        url: "http://ollama.test/v1/embeddings",
        body: JSON.stringify({
          model: "nomic-embed-text",
          input: ["alpha", "beta"]
        })
      }
    ]);
  });
});
