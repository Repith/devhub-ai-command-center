import { createHash } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { TenantContext } from "@devhub/domain";
import {
  createDatabaseClient,
  PrismaDocumentRepository,
  type DatabaseClient
} from "@devhub/database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { processDocument } from "../src/document-processor";

const connectionString = process.env.DATABASE_URL;
const describeWithDatabase = connectionString ? describe : describe.skip;

describeWithDatabase("processDocument integration", () => {
  let database: DatabaseClient;
  let repository: PrismaDocumentRepository;
  let context: TenantContext;
  const storageDir = join("data", "test-uploads", crypto.randomUUID());

  beforeAll(async () => {
    database = createDatabaseClient(connectionString!);
    repository = new PrismaDocumentRepository(database);
    const tenant = await database.tenant.create({
      data: {
        name: "Worker Documents Workspace",
        slug: `worker-documents-${crypto.randomUUID()}`
      }
    });
    context = {
      tenantId: tenant.id,
      userId: crypto.randomUUID(),
      correlationId: crypto.randomUUID()
    };
  });

  afterAll(async () => {
    await database.tenant.deleteMany({ where: { id: context.tenantId } });
    await database.$disconnect();
    await rm(storageDir, { recursive: true, force: true });
  });

  it("indexes chunks idempotently for duplicate job delivery", async () => {
    const documentId = crypto.randomUUID();
    const storageKey = `${context.tenantId}/${documentId}/source.txt`;
    const content = Buffer.from(
      Array.from({ length: 1600 }, (_, index) => `word${index}`).join(" ")
    );
    const checksum = createHash("sha256").update(content).digest("hex");
    await mkdir(join(storageDir, context.tenantId, documentId), {
      recursive: true
    });
    await writeFile(join(storageDir, storageKey), content);
    await repository.createUploaded(context, {
      id: documentId,
      fileName: "source.txt",
      storageKey,
      mimeType: "text/plain",
      sizeBytes: content.byteLength,
      checksum
    });

    const job = {
      version: 1 as const,
      tenantId: context.tenantId,
      userId: context.userId,
      correlationId: context.correlationId,
      documentId,
      storageKey,
      mimeType: "text/plain" as const,
      checksum
    };
    await processDocument({ database, storageDir, input: job });
    await processDocument({ database, storageDir, input: job });

    const document = await repository.findById(context, documentId);
    const chunks = await repository.listChunks(context, documentId);
    expect(document?.status).toBe("INDEXED");
    expect(chunks?.length).toBe(3);
    expect(chunks?.map((chunk) => chunk.ordinal)).toEqual([0, 1, 2]);
  });
});
