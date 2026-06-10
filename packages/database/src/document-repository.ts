import type {
  Document,
  DocumentChunk,
  DocumentStatus
} from "@devhub/contracts";
import type { TenantContext } from "@devhub/domain";

import type { DatabaseClient } from "./client.js";

export interface UploadedDocumentInput {
  id: string;
  fileName: string;
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
  checksum: string;
}

export interface DocumentRecord {
  id: string;
  tenantId: string;
  fileName: string;
  storageKey: string;
  mimeType: string;
  sizeBytes: bigint;
  checksum: string;
  status: DocumentStatus;
  failureCode: string | null;
  failureDetail: string | null;
  createdAt: Date;
  updatedAt: Date;
  _count?: { chunks: number };
}

export interface DocumentChunkRecord {
  id: string;
  tenantId: string;
  documentId: string;
  ordinal: number;
  content: string;
  tokenCount: number | null;
  pageNumber: number | null;
  vectorId: string | null;
  createdAt: Date;
  document?: { fileName: string; status: DocumentStatus };
}

export interface CreateDocumentChunkInput {
  ordinal: number;
  content: string;
  tokenCount?: number;
  pageNumber?: number | null;
}

export class PrismaDocumentRepository {
  public constructor(private readonly database: DatabaseClient) {}

  public async createUploaded(
    context: TenantContext,
    input: UploadedDocumentInput
  ): Promise<DocumentRecord> {
    return this.database.document.create({
      data: {
        id: input.id,
        tenantId: context.tenantId,
        fileName: input.fileName,
        storageKey: input.storageKey,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        checksum: input.checksum
      },
      include: { _count: { select: { chunks: true } } }
    });
  }

  public async list(
    context: TenantContext
  ): Promise<readonly DocumentRecord[]> {
    return this.database.document.findMany({
      where: { tenantId: context.tenantId, deletedAt: null },
      include: { _count: { select: { chunks: true } } },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      take: 100
    });
  }

  public async findById(
    context: TenantContext,
    documentId: string
  ): Promise<DocumentRecord | null> {
    return this.database.document.findFirst({
      where: {
        id: documentId,
        tenantId: context.tenantId,
        deletedAt: null
      },
      include: { _count: { select: { chunks: true } } }
    });
  }

  public async listChunks(
    context: TenantContext,
    documentId: string
  ): Promise<readonly DocumentChunkRecord[] | null> {
    const document = await this.findById(context, documentId);
    if (!document) {
      return null;
    }
    return this.database.documentChunk.findMany({
      where: { tenantId: context.tenantId, documentId },
      orderBy: { ordinal: "asc" },
      take: 1000
    });
  }

  public async markProcessing(
    context: TenantContext,
    documentId: string
  ): Promise<DocumentRecord | null> {
    const updated = await this.database.document.updateManyAndReturn({
      where: {
        id: documentId,
        tenantId: context.tenantId,
        deletedAt: null,
        status: { not: "DELETING" }
      },
      data: {
        status: "PROCESSING",
        failureCode: null,
        failureDetail: null
      }
    });
    return updated[0] ?? null;
  }

  public async replaceChunksForEmbedding(
    context: TenantContext,
    documentId: string,
    chunks: readonly CreateDocumentChunkInput[]
  ): Promise<readonly DocumentChunkRecord[] | null> {
    return this.database.$transaction(async (transaction) => {
      const updated = await transaction.document.updateManyAndReturn({
        where: {
          id: documentId,
          tenantId: context.tenantId,
          deletedAt: null,
          status: { not: "DELETING" }
        },
        data: { status: "PROCESSING" }
      });
      const document = updated[0];
      if (!document) {
        return null;
      }

      await transaction.documentChunk.deleteMany({
        where: { tenantId: context.tenantId, documentId }
      });
      if (chunks.length === 0) {
        return [];
      }

      const created = await transaction.documentChunk.createManyAndReturn({
        data: chunks.map((chunk) => ({
          tenantId: context.tenantId,
          documentId,
          ordinal: chunk.ordinal,
          content: chunk.content,
          tokenCount: chunk.tokenCount ?? null,
          pageNumber: chunk.pageNumber ?? null
        }))
      });
      return created.toSorted((left, right) => left.ordinal - right.ordinal);
    });
  }

  public async setChunkVectorIds(
    context: TenantContext,
    documentId: string,
    vectorIds: ReadonlyMap<string, string>
  ): Promise<void> {
    await this.database.$transaction(
      [...vectorIds].map(([chunkId, vectorId]) =>
        this.database.documentChunk.updateMany({
          where: { id: chunkId, tenantId: context.tenantId, documentId },
          data: { vectorId }
        })
      )
    );
  }

  public async markIndexed(
    context: TenantContext,
    documentId: string
  ): Promise<DocumentRecord | null> {
    return this.database.document.update({
      where: {
        tenantId_id: {
          tenantId: context.tenantId,
          id: documentId
        }
      },
      data: {
        status: "INDEXED",
        failureCode: null,
        failureDetail: null
      },
      include: { _count: { select: { chunks: true } } }
    });
  }

  public async findIndexedChunksByIds(
    context: TenantContext,
    chunkIds: readonly string[]
  ): Promise<readonly DocumentChunkRecord[]> {
    if (chunkIds.length === 0) {
      return [];
    }
    return this.database.documentChunk.findMany({
      where: {
        id: { in: [...chunkIds] },
        tenantId: context.tenantId,
        document: { status: "INDEXED", deletedAt: null }
      },
      include: { document: { select: { fileName: true, status: true } } }
    });
  }

  public async markFailed(
    context: TenantContext,
    documentId: string,
    code: string,
    detail: string
  ): Promise<DocumentRecord | null> {
    const updated = await this.database.document.updateManyAndReturn({
      where: {
        id: documentId,
        tenantId: context.tenantId,
        deletedAt: null,
        status: { not: "DELETING" }
      },
      data: {
        status: "FAILED",
        failureCode: code,
        failureDetail: detail.slice(0, 1000)
      }
    });
    return updated[0] ?? null;
  }

  public toDocumentResponse(record: DocumentRecord): Document {
    return {
      id: record.id,
      fileName: record.fileName,
      mimeType: record.mimeType,
      sizeBytes: Number(record.sizeBytes),
      checksum: record.checksum,
      status: record.status,
      failureCode: record.failureCode,
      failureDetail: record.failureDetail,
      chunkCount: record._count?.chunks ?? 0,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString()
    };
  }

  public toChunkResponse(record: DocumentChunkRecord): DocumentChunk {
    return {
      id: record.id,
      documentId: record.documentId,
      ordinal: record.ordinal,
      content: record.content,
      tokenCount: record.tokenCount,
      pageNumber: record.pageNumber,
      createdAt: record.createdAt.toISOString()
    };
  }
}
