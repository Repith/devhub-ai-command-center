import { afterEach, describe, expect, it, vi } from "vitest";

import {
  deleteDocument,
  reindexDocument,
  streamKnowledgeSearch,
  uploadDocument
} from "../lib/documents-api";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("documents-api", () => {
  it("uploads documents as multipart form data", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "64fe81ba-7faf-4b37-a2b8-347cd19b5550",
          fileName: "guide.md",
          mimeType: "text/markdown",
          sizeBytes: 12,
          checksum: "sha256",
          status: "UPLOADED",
          failureCode: null,
          failureDetail: null,
          chunkCount: 0,
          createdAt: "2026-06-10T12:00:00.000Z",
          updatedAt: "2026-06-10T12:00:00.000Z"
        }),
        { status: 201, headers: { "Content-Type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const file = new File(["hello"], "guide.md", { type: "text/markdown" });
    await expect(uploadDocument("access-token", file)).resolves.toMatchObject({
      fileName: "guide.md",
      status: "UPLOADED"
    });

    const [, request] = fetchMock.mock.calls[0]!;
    expect(request).toMatchObject({
      method: "POST",
      credentials: "include",
      headers: { Authorization: "Bearer access-token" }
    });
    expect(request.body).toBeInstanceOf(FormData);
  });

  it("deletes a document", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      deleteDocument("access-token", "64fe81ba-7faf-4b37-a2b8-347cd19b5550")
    ).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/documents/64fe81ba-7faf-4b37-a2b8-347cd19b5550",
      {
        method: "DELETE",
        credentials: "include",
        headers: { Authorization: "Bearer access-token" }
      }
    );
  });

  it("queues document reindexing", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "64fe81ba-7faf-4b37-a2b8-347cd19b5550",
          fileName: "guide.md",
          mimeType: "text/markdown",
          sizeBytes: 12,
          checksum: "sha256",
          status: "UPLOADED",
          failureCode: null,
          failureDetail: null,
          chunkCount: 2,
          createdAt: "2026-06-10T12:00:00.000Z",
          updatedAt: "2026-06-10T12:00:00.000Z"
        }),
        { status: 202, headers: { "Content-Type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      reindexDocument("access-token", "64fe81ba-7faf-4b37-a2b8-347cd19b5550")
    ).resolves.toMatchObject({ status: "UPLOADED" });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/documents/64fe81ba-7faf-4b37-a2b8-347cd19b5550/reindex",
      {
        method: "POST",
        credentials: "include",
        headers: { Authorization: "Bearer access-token" }
      }
    );
  });

  it("parses streamed knowledge search events", async () => {
    const documentId = "64fe81ba-7faf-4b37-a2b8-347cd19b5550";
    const chunkId = "23c38ed0-61db-4ab7-a1c4-89187c6912c8";
    const lines = [
      JSON.stringify({
        version: 1,
        type: "knowledge.search.started",
        query: "Who is Marcin?",
        results: [
          {
            citationLabel: "doc:64fe81ba#0",
            score: 0.91,
            documentId,
            chunkId,
            fileName: "cv.pdf",
            ordinal: 0,
            pageNumber: null,
            content: "Marcin builds AI command centers."
          }
        ]
      }),
      JSON.stringify({
        version: 1,
        type: "knowledge.search.delta",
        text: "Marcin"
      }),
      JSON.stringify({
        version: 1,
        type: "knowledge.search.completed",
        answer: "Marcin builds AI command centers. [doc:64fe81ba#0]"
      })
    ].join("\n");
    const encoded = new TextEncoder().encode(`${lines}\n`);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoded.slice(0, 23));
        controller.enqueue(encoded.slice(23, 89));
        controller.enqueue(encoded.slice(89));
        controller.close();
      }
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(stream, { status: 200 }))
    );
    const events: string[] = [];

    await streamKnowledgeSearch(
      "access-token",
      { query: "Who is Marcin?", limit: 5, documentIds: [documentId] },
      (event) => events.push(event.type)
    );

    expect(events).toEqual([
      "knowledge.search.started",
      "knowledge.search.delta",
      "knowledge.search.completed"
    ]);
  });
});
