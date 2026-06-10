import { describe, expect, it } from "vitest";

import type { EmbeddingProviderPort } from "@devhub/ai";
import type { PrismaDocumentRepository } from "@devhub/database";
import type { VectorStorePort } from "@devhub/rag";

import { createKnowledgeSearchTool } from "../src";

const context = {
  tenantId: "00000000-0000-0000-0000-000000000001",
  userId: "00000000-0000-0000-0000-000000000002",
  correlationId: "knowledge-test"
};

describe("knowledge.search", () => {
  it("returns only PostgreSQL-confirmed chunks from vector hits", async () => {
    const documentId = crypto.randomUUID();
    const chunkId = crypto.randomUUID();
    const tool = createKnowledgeSearchTool({
      documents: {
        findIndexedChunksByIds: () =>
          Promise.resolve([
            {
              id: chunkId,
              tenantId: context.tenantId,
              documentId,
              ordinal: 0,
              content: "Known fact.",
              tokenCount: 2,
              pageNumber: null,
              vectorId: chunkId,
              createdAt: new Date(),
              document: { fileName: "facts.txt", status: "INDEXED" }
            }
          ])
      } as unknown as PrismaDocumentRepository,
      embeddingModel: "nomic-embed-text",
      embeddingProvider: fakeEmbeddingProvider(),
      embeddingTimeoutMs: 1000,
      vectorStore: fakeVectorStore(documentId, chunkId)
    });

    const output = await tool.execute({ query: "fact", limit: 5 }, context);

    expect(output.results).toEqual([
      {
        citationLabel: `doc:${documentId.slice(0, 8)}#0`,
        score: 0.8,
        documentId,
        chunkId,
        fileName: "facts.txt",
        ordinal: 0,
        pageNumber: null,
        content: "Known fact."
      }
    ]);
  });
});

function fakeEmbeddingProvider(): EmbeddingProviderPort {
  return {
    name: "fake",
    embed: () =>
      Promise.resolve({
        model: "nomic-embed-text",
        vectors: [[1, 0, 0]],
        usage: { inputTokens: 1 }
      })
  };
}

function fakeVectorStore(documentId: string, chunkId: string): VectorStorePort {
  return {
    name: "fake",
    deleteDocument: () => Promise.resolve(),
    upsert: () => Promise.resolve(),
    search: (input) =>
      Promise.resolve([
        {
          id: chunkId,
          score: 0.8,
          payload: {
            tenantId: input.tenantId,
            documentId,
            chunkId,
            ordinal: 0
          }
        },
        {
          id: crypto.randomUUID(),
          score: 0.9,
          payload: {
            tenantId: crypto.randomUUID(),
            documentId: crypto.randomUUID(),
            chunkId: crypto.randomUUID(),
            ordinal: 0
          }
        }
      ])
  };
}
