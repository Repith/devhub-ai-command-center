import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { DocumentIngestionJob } from "@devhub/contracts";
import type { DatabaseClient } from "@devhub/database";
import type { EmbeddingProviderPort } from "@devhub/ai";
import type { VectorStorePort } from "@devhub/rag";

import { processDocument } from "../src/document-processor";

describe("processDocument", () => {
  it("marks corrupt storage as failed", async () => {
    const tenantId = crypto.randomUUID();
    const documentId = crypto.randomUUID();
    const storageDir = join("data", "test-uploads", crypto.randomUUID());
    const storageKey = `${tenantId}/${documentId}/source.txt`;
    await mkdir(join(storageDir, tenantId, documentId), { recursive: true });
    await writeFile(join(storageDir, storageKey), "changed");
    const updates: string[] = [];
    const database = fakeDatabase(updates);

    await expect(
      processDocument({
        database,
        embeddingModel: "nomic-embed-text",
        embeddingProvider: fakeEmbeddingProvider(),
        embeddingTimeoutMs: 1000,
        storageDir,
        input: {
          version: 1,
          tenantId,
          userId: crypto.randomUUID(),
          correlationId: crypto.randomUUID(),
          documentId,
          storageKey,
          mimeType: "text/plain",
          checksum: "not-the-real-checksum"
        } satisfies DocumentIngestionJob,
        vectorStore: fakeVectorStore()
      })
    ).rejects.toThrow(/checksum/i);

    expect(updates).toEqual(["PROCESSING", "FAILED"]);
  });
});

function fakeDatabase(updates: string[]): DatabaseClient {
  return {
    document: {
      updateManyAndReturn: ({ data }: { data: { status: string } }) => {
        updates.push(data.status);
        return Promise.resolve([
          {
            id: crypto.randomUUID(),
            tenantId: crypto.randomUUID(),
            fileName: "source.txt",
            storageKey: "source.txt",
            mimeType: "text/plain",
            sizeBytes: 7n,
            checksum: "checksum",
            status: data.status,
            failureCode: null,
            failureDetail: null,
            createdAt: new Date(),
            updatedAt: new Date()
          }
        ]);
      }
    }
  } as unknown as DatabaseClient;
}

function fakeEmbeddingProvider(): EmbeddingProviderPort {
  return {
    name: "fake",
    embed: () =>
      Promise.resolve({
        model: "fake",
        vectors: [],
        usage: { inputTokens: 0 }
      })
  };
}

function fakeVectorStore(): VectorStorePort {
  return {
    name: "fake",
    deleteDocument: () => Promise.resolve(),
    search: () => Promise.resolve([]),
    upsert: () => Promise.resolve()
  };
}
