import { describe, expect, it, vi } from "vitest";

import { OllamaOpenAiProvider } from "../src/index.js";

describe("OllamaOpenAiProvider", () => {
  it("streams content and reports usage from OpenAI-compatible SSE", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        [
          'data: {"choices":[{"delta":{"content":"Hello"},"finish_reason":null}]}',
          "",
          'data: {"choices":[{"delta":{"content":" world"},"finish_reason":"stop"}]}',
          "",
          'data: {"choices":[],"usage":{"prompt_tokens":12,"completion_tokens":2}}',
          "",
          "data: [DONE]",
          ""
        ].join("\n"),
        {
          headers: { "Content-Type": "text/event-stream" },
          status: 200
        }
      )
    );
    const provider = new OllamaOpenAiProvider({
      baseUrl: "http://localhost:11434/v1/",
      fetch: request
    });

    const events = [];
    for await (const event of provider.streamChat({
      model: "qwen3:8b",
      messages: [{ role: "user", content: "Hello" }],
      maxTokens: 64,
      timeoutMs: 1_000
    })) {
      events.push(event);
    }

    expect(events).toEqual([
      { type: "delta", text: "Hello" },
      { type: "delta", text: " world" },
      {
        type: "completed",
        finishReason: "stop",
        usage: { inputTokens: 12, outputTokens: 2 }
      }
    ]);
    expect(request).toHaveBeenCalledWith(
      "http://localhost:11434/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          model: "qwen3:8b",
          messages: [{ role: "user", content: "Hello" }],
          stream: true,
          stream_options: { include_usage: true },
          max_tokens: 64
        })
      })
    );
  });

  it("maps provider failures without exposing arbitrary response data", async () => {
    const provider = new OllamaOpenAiProvider({
      fetch: vi.fn<typeof fetch>().mockResolvedValue(
        new Response(
          JSON.stringify({ error: { message: "model not found" } }),
          {
            status: 404
          }
        )
      )
    });

    await expect(async () => {
      for await (const event of provider.streamChat({
        model: "missing",
        messages: [],
        timeoutMs: 1_000
      })) {
        void event;
      }
    }).rejects.toMatchObject({
      code: "LLM_REQUEST_FAILED",
      message: "Ollama returned HTTP 404: model not found"
    });
  });
});
