import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join, normalize } from "node:path";

import {
  documentIngestionJobSchema,
  type DocumentIngestionJob
} from "@devhub/contracts";
import {
  PrismaDocumentRepository,
  type DatabaseClient
} from "@devhub/database";
import { chunkText } from "@devhub/rag";
import type { TenantContext } from "@devhub/domain";

import { parseDocument } from "./document-parser.js";

export interface ProcessDocumentOptions {
  database: DatabaseClient;
  storageDir: string;
  input: DocumentIngestionJob;
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
    await repository.replaceChunksAndIndex(context, input.documentId, chunks);
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
