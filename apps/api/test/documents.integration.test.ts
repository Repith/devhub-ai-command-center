import { rm } from "node:fs/promises";
import { join } from "node:path";

import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type {
  AccessTokenResponse,
  Document,
  DocumentIngestionJob,
  DocumentList,
  KnowledgeSearchResponse
} from "@devhub/contracts";
import type { EmbeddingProviderPort } from "@devhub/ai";
import type { DatabaseClient } from "@devhub/database";
import type { VectorSearchHit, VectorStorePort } from "@devhub/rag";

import { configureApp } from "../src/app-config";
import { AppModule } from "../src/app.module";
import { DATABASE_CLIENT } from "../src/database/database.module";
import { BullMqDocumentIngestionQueue } from "../src/documents/document-queue.service";
import {
  EMBEDDING_PROVIDER,
  VECTOR_STORE
} from "../src/documents/documents.tokens";

const ownerEmail = `documents-owner-${crypto.randomUUID()}@example.com`;
const outsiderEmail = `documents-outsider-${crypto.randomUUID()}@example.com`;
const password = "correct horse battery staple";
const storageDir = join("data", "test-uploads", crypto.randomUUID());

describe("document upload and tenant isolation", () => {
  let app: INestApplication | undefined;
  let database: DatabaseClient | undefined;
  let ownerToken: string;
  let outsiderToken: string;
  let searchHits: VectorSearchHit[] = [];
  const jobs: DocumentIngestionJob[] = [];

  beforeAll(async () => {
    process.env.JWT_SECRET = "integration-secret-with-at-least-32-characters";
    process.env.JWT_ISSUER = "devhub-ai-command-center";
    process.env.JWT_AUDIENCE = "devhub-api";
    process.env.REFRESH_COOKIE_SECURE = "false";
    process.env.DOCUMENT_STORAGE_DIR = storageDir;

    const module = await Test.createTestingModule({
      imports: [AppModule]
    })
      .overrideProvider(BullMqDocumentIngestionQueue)
      .useValue({
        enqueue: (input: DocumentIngestionJob) => {
          jobs.push(input);
          return Promise.resolve();
        }
      })
      .overrideProvider(EMBEDDING_PROVIDER)
      .useValue(fakeEmbeddingProvider())
      .overrideProvider(VECTOR_STORE)
      .useValue(fakeVectorStore(() => searchHits))
      .compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
    database = app.get<DatabaseClient>(DATABASE_CLIENT);

    const [ownerRegistration, outsiderRegistration] = await Promise.all([
      request(app.getHttpServer()).post("/api/v1/auth/register").send({
        email: ownerEmail,
        password,
        tenantName: "Documents Owner Workspace"
      }),
      request(app.getHttpServer()).post("/api/v1/auth/register").send({
        email: outsiderEmail,
        password,
        tenantName: "Documents Outsider Workspace"
      })
    ]);
    ownerToken = (ownerRegistration.body as AccessTokenResponse).accessToken;
    outsiderToken = (outsiderRegistration.body as AccessTokenResponse)
      .accessToken;
  });

  afterAll(async () => {
    if (database) {
      await database.user.deleteMany({
        where: { email: { in: [ownerEmail, outsiderEmail] } }
      });
    }
    await app?.close();
    await rm(storageDir, { recursive: true, force: true });
  });

  it("uploads a supported document and enqueues tenant-scoped ingestion", async () => {
    const response = await request(app!.getHttpServer())
      .post("/api/v1/documents")
      .set("Authorization", `Bearer ${ownerToken}`)
      .attach("file", Buffer.from("# Notes\n\nHello knowledge."), {
        filename: "notes.txt",
        contentType: "text/plain"
      })
      .expect(201);
    const document = response.body as Document;

    expect(document).toMatchObject({
      fileName: "notes.txt",
      mimeType: "text/plain",
      status: "UPLOADED",
      chunkCount: 0
    });
    expect(document).not.toHaveProperty("tenantId");
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      version: 1,
      documentId: document.id,
      mimeType: "text/plain"
    });

    const listResponse = await request(app!.getHttpServer())
      .get("/api/v1/documents")
      .set("Authorization", `Bearer ${ownerToken}`)
      .expect(200);
    const list = listResponse.body as DocumentList;
    expect(list.data.map((item) => item.id)).toContain(document.id);

    await request(app!.getHttpServer())
      .get(`/api/v1/documents/${document.id}`)
      .set("Authorization", `Bearer ${outsiderToken}`)
      .expect(404);
  });

  it("rejects unsupported file types", async () => {
    await request(app!.getHttpServer())
      .post("/api/v1/documents")
      .set("Authorization", `Bearer ${ownerToken}`)
      .attach("file", Buffer.from("name,value\n"), {
        filename: "table.csv",
        contentType: "text/csv"
      })
      .expect(400);
  });

  it("rejects a PDF upload without a PDF signature", async () => {
    await request(app!.getHttpServer())
      .post("/api/v1/documents")
      .set("Authorization", `Bearer ${ownerToken}`)
      .attach("file", Buffer.from("not really a pdf"), {
        filename: "fake.pdf",
        contentType: "application/pdf"
      })
      .expect(400);
  });

  it("returns only PostgreSQL-authorized indexed search hits", async () => {
    const owner = await database!.user.findUniqueOrThrow({
      where: { email: ownerEmail },
      include: { memberships: true }
    });
    const tenantId = owner.memberships[0]!.tenantId;
    const document = await database!.document.create({
      data: {
        tenantId,
        fileName: "indexed.txt",
        storageKey: `${tenantId}/${crypto.randomUUID()}/source.txt`,
        mimeType: "text/plain",
        sizeBytes: 12,
        checksum: "checksum",
        status: "INDEXED"
      }
    });
    const chunk = await database!.documentChunk.create({
      data: {
        tenantId,
        documentId: document.id,
        ordinal: 0,
        content: "Tenant-owned knowledge chunk.",
        tokenCount: 4,
        vectorId: crypto.randomUUID()
      }
    });
    searchHits = [
      {
        id: chunk.id,
        score: 0.91,
        payload: {
          tenantId,
          documentId: document.id,
          chunkId: chunk.id,
          ordinal: 0
        }
      },
      {
        id: crypto.randomUUID(),
        score: 0.99,
        payload: {
          tenantId: crypto.randomUUID(),
          documentId: crypto.randomUUID(),
          chunkId: crypto.randomUUID(),
          ordinal: 0
        }
      }
    ];

    const response = await request(app!.getHttpServer())
      .post("/api/v1/documents/search")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ query: "knowledge", limit: 5 })
      .expect(200);
    const body = response.body as KnowledgeSearchResponse;

    expect(body.results).toHaveLength(1);
    expect(body.results[0]).toMatchObject({
      documentId: document.id,
      chunkId: chunk.id,
      fileName: "indexed.txt",
      content: "Tenant-owned knowledge chunk."
    });
    expect(body.results[0]?.citationLabel).toBe(
      `doc:${document.id.slice(0, 8)}#0`
    );
  });
});

function fakeEmbeddingProvider(): EmbeddingProviderPort {
  return {
    name: "fake",
    embed: (input) =>
      Promise.resolve({
        model: input.model,
        vectors: input.texts.map(() => [1, 0, 0]),
        usage: { inputTokens: input.texts.length }
      })
  };
}

function fakeVectorStore(
  hits: () => readonly VectorSearchHit[]
): VectorStorePort {
  return {
    name: "fake",
    deleteDocument: () => Promise.resolve(),
    search: () => Promise.resolve(hits()),
    upsert: () => Promise.resolve()
  };
}
