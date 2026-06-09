import { afterEach, describe, expect, it, vi } from "vitest";

import { streamChat } from "../lib/chat-api";

describe("streamChat", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("parses NDJSON events split across transport chunks", async () => {
    const conversationId = crypto.randomUUID();
    const lines = [
      JSON.stringify({
        version: 1,
        type: "chat.started",
        conversationId,
        userMessage: {
          id: crypto.randomUUID(),
          conversationId,
          role: "USER",
          content: "Hello",
          sequence: 1,
          provider: null,
          model: null,
          inputTokens: null,
          outputTokens: null,
          durationMs: null,
          createdAt: new Date().toISOString()
        }
      }),
      JSON.stringify({ version: 1, type: "chat.delta", text: "Hi" })
    ].join("\n");
    const encoded = new TextEncoder().encode(`${lines}\n`);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoded.slice(0, 17));
        controller.enqueue(encoded.slice(17, 61));
        controller.enqueue(encoded.slice(61));
        controller.close();
      }
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(stream, { status: 200 }))
    );
    const events: string[] = [];

    await streamChat(
      "access-token",
      crypto.randomUUID(),
      { message: "Hello" },
      (event) => events.push(event.type)
    );

    expect(events).toEqual(["chat.started", "chat.delta"]);
  });
});
