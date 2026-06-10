import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join, normalize } from "node:path";

import {
  documentIngestionJobSchema,
  type DocumentIngestionJob
} from "@devhub/contracts";
import type { EmbeddingProviderPort } from "@devhub/ai";
import {
  PrismaDocumentRepository,
  type DatabaseClient
} from "@devhub/database";
import { chunkText, type VectorPoint, type VectorStorePort } from "@devhub/rag";
import type { TenantContext } from "@devhub/domain";

import { parseDocument } from "./document-parser.js";

export interface ProcessDocumentOptions {
  database: DatabaseClient;
  embeddingModel: string;
  embeddingProvider: EmbeddingProviderPort;
  embeddingTimeoutMs: number;
  storageDir: string;
  input: DocumentIngestionJob;
  vectorStore: VectorStorePort;
}

export async function processDocument(
  options: ProcessDocumentOptions
): Promise<void> {
  const input = documentIngestionJobSchema.parse(options.input);
  const repository = new PrismaDocumentRepository(options.database);
  const context = toContext(input);
  await repository.markProcessing(context, input.documentId);

  try {
    const buffer = await readFile(
      resolveStoragePath(options.storageDir, input.storageKey)
    );
    assertChecksum(buffer, input.checksum);
    const parsed = await parseDocument(buffer, input.mimeType);
    const chunks = chunkText(parsed.text);
    if (chunks.length === 0) {
      throw new Error("Document did not contain extractable text.");
    }
    const records = await repository.replaceChunksForEmbedding(
      context,
      input.documentId,
      chunks
    );
    if (!records) {
      throw new Error("Document disappeared before chunking.");
    }
    await options.vectorStore.deleteDocument(
      context.tenantId,
      input.documentId
    );
    const embeddings = await options.embeddingProvider.embed({
      model: options.embeddingModel,
      texts: records.map((chunk) => chunk.content),
      timeoutMs: options.embeddingTimeoutMs
    });
    if (embeddings.vectors.length !== records.length) {
      throw new Error(
        "Embedding provider returned an unexpected vector count."
      );
    }
    const points = records.map(
      (chunk, index): VectorPoint => ({
        id: chunk.id,
        vector: embeddings.vectors[index]!,
        payload: {
          tenantId: context.tenantId,
          documentId: input.documentId,
          chunkId: chunk.id,
          ordinal: chunk.ordinal
        }
      })
    );
    await options.vectorStore.upsert(points);
    await repository.setChunkVectorIds(
      context,
      input.documentId,
      new Map(points.map((point) => [point.id, point.id]))
    );
    await repository.markIndexed(context, input.documentId);
  } catch (error) {
    await repository.markFailed(
      context,
      input.documentId,
      "DOCUMENT_INGESTION_FAILED",
      error instanceof Error ? error.message : "Unknown ingestion failure."
    );
    throw error;
  }
}

function resolveStoragePath(storageDir: string, storageKey: string): string {
  const safeKey = normalize(storageKey).replace(/^(\.\.[/\\])+/, "");
  return join(storageDir, safeKey);
}

function assertChecksum(buffer: Buffer, expectedChecksum: string): void {
  const checksum = createHash("sha256").update(buffer).digest("hex");
  if (checksum !== expectedChecksum) {
    throw new Error("Stored document checksum did not match metadata.");
  }
}

function toContext(input: DocumentIngestionJob): TenantContext {
  return {
    tenantId: input.tenantId,
    userId: input.userId,
    correlationId: input.correlationId
  };
}
