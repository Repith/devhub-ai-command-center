import { createHash, randomUUID } from "node:crypto";
import { extname } from "node:path";

import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException
} from "@nestjs/common";

import {
  supportedDocumentMimeTypeSchema,
  type Document,
  type DocumentChunkList,
  type DocumentIngestionJob,
  type DocumentList,
  type KnowledgeSearchRequest,
  type KnowledgeSearchResponse,
  type SupportedDocumentMimeType
} from "@devhub/contracts";
import { EmbeddingProviderError, type EmbeddingProviderPort } from "@devhub/ai";
import type { PrismaDocumentRepository } from "@devhub/database";
import {
  VectorStoreError,
  type VectorSearchHit,
  type VectorStorePort
} from "@devhub/rag";
import type { TenantContext } from "@devhub/domain";

import type { RequestPrincipal } from "../auth/auth.types";
import { AuditService } from "../audit/audit.service";
import { maxDocumentUploadBytes } from "./documents.config";
import {
  DOCUMENT_INGESTION_QUEUE,
  DOCUMENT_REPOSITORY,
  EMBEDDING_PROVIDER,
  VECTOR_STORE
} from "./documents.tokens";
import type { DocumentsConfig } from "./documents.config";
import type { DocumentIngestionQueue } from "./document-queue.service";
import { LocalDocumentStorage } from "./local-document-storage.service";

const extensionByMimeType: Record<SupportedDocumentMimeType, string> = {
  "text/markdown": ".md",
  "text/plain": ".txt",
  "application/pdf": ".pdf"
};
const textDecoder = new TextDecoder("utf-8", { fatal: true });

export interface UploadedMultipartFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  public constructor(
    @Inject(DOCUMENT_REPOSITORY)
    private readonly documents: PrismaDocumentRepository,
    @Inject(DOCUMENT_INGESTION_QUEUE)
    private readonly queue: DocumentIngestionQueue,
    @Inject(LocalDocumentStorage)
    private readonly storage: LocalDocumentStorage,
    @Inject(EMBEDDING_PROVIDER)
    private readonly embeddingProvider: EmbeddingProviderPort,
    @Inject(VECTOR_STORE)
    private readonly vectorStore: VectorStorePort,
    @Inject("DOCUMENTS_CONFIG")
    private readonly config: DocumentsConfig,
    @Inject(AuditService) private readonly audit: AuditService
  ) {}

  public async upload(
    principal: RequestPrincipal,
    file: UploadedMultipartFile | undefined
  ): Promise<Document> {
    const valid = this.validateFile(file);
    const context = this.context(principal);
    const documentId = randomUUID();
    const checksum = createHash("sha256").update(valid.buffer).digest("hex");
    const extension = extensionByMimeType[valid.mimeType];
    const storageKey = `${context.tenantId}/${documentId}/source${extension}`;

    await this.storage.write(storageKey, valid.buffer);
    const record = await this.documents.createUploaded(context, {
      id: documentId,
      fileName: this.cleanFileName(valid.originalName),
      storageKey,
      mimeType: valid.mimeType,
      sizeBytes: valid.size,
      checksum
    });
    try {
      await this.queue.enqueue(
        this.toJob(principal, record.id, storageKey, valid.mimeType, checksum)
      );
    } catch {
      await this.documents.markFailed(
        context,
        record.id,
        "DOCUMENT_QUEUE_UNAVAILABLE",
        "Document was stored, but ingestion could not be queued. Confirm Redis is running and restart setup/dev."
      );
      throw new ServiceUnavailableException({
        code: "DOCUMENT_QUEUE_UNAVAILABLE",
        message:
          "Document was stored, but ingestion could not be queued. Confirm Redis is running and try again."
      });
    }
    await this.recordAudit(principal, {
      action: "document.uploaded",
      resourceType: "document",
      resourceId: record.id,
      metadata: {
        mimeType: valid.mimeType,
        sizeBytes: valid.size,
        checksum
      }
    });
    return this.documents.toDocumentResponse(record);
  }

  public async list(principal: RequestPrincipal): Promise<DocumentList> {
    const data = await this.documents.list(this.context(principal));
    return {
      data: data.map((document) => this.documents.toDocumentResponse(document)),
      page: { cursor: null, nextCursor: null, limit: 100 }
    };
  }

  public async get(
    principal: RequestPrincipal,
    documentId: string
  ): Promise<Document> {
    const document = await this.documents.findById(
      this.context(principal),
      documentId
    );
    if (!document) {
      throw new NotFoundException("Document was not found.");
    }
    return this.documents.toDocumentResponse(document);
  }

  public async listChunks(
    principal: RequestPrincipal,
    documentId: string
  ): Promise<DocumentChunkList> {
    const chunks = await this.documents.listChunks(
      this.context(principal),
      documentId
    );
    if (!chunks) {
      throw new NotFoundException("Document was not found.");
    }
    return {
      data: chunks.map((chunk) => this.documents.toChunkResponse(chunk)),
      page: { cursor: null, nextCursor: null, limit: 1000 }
    };
  }

  public async search(
    principal: RequestPrincipal,
    input: KnowledgeSearchRequest
  ): Promise<KnowledgeSearchResponse> {
    const context = this.context(principal);
    const embeddings = await this.embedQuery(input);
    const [queryVector] = embeddings.vectors;
    if (!queryVector) {
      return { query: input.query, results: [] };
    }

    const hits = await this.searchVectors(context, queryVector, input);
    const chunks = await this.documents.findIndexedChunksByIds(
      context,
      hits.map((hit) => hit.payload.chunkId)
    );
    const chunkById = new Map(chunks.map((chunk) => [chunk.id, chunk]));

    const response = {
      query: input.query,
      results: hits.flatMap((hit) => {
        const chunk = chunkById.get(hit.payload.chunkId);
        if (!chunk || !chunk.document) {
          return [];
        }
        return [
          {
            citationLabel: citationLabel(hit),
            score: hit.score,
            documentId: chunk.documentId,
            chunkId: chunk.id,
            fileName: chunk.document.fileName,
            ordinal: chunk.ordinal,
            pageNumber: chunk.pageNumber,
            content: chunk.content
          }
        ];
      })
    };
    await this.recordAudit(principal, {
      action: "document.search",
      resourceType: "document",
      metadata: {
        requestedLimit: input.limit,
        resultCount: response.results.length
      }
    });
    return response;
  }

  private async embedQuery(
    input: KnowledgeSearchRequest
  ): Promise<Awaited<ReturnType<EmbeddingProviderPort["embed"]>>> {
    try {
      return await this.embeddingProvider.embed({
        model: this.config.embeddingModel,
        texts: [input.query],
        timeoutMs: this.config.embeddingTimeoutMs
      });
    } catch (error) {
      if (error instanceof EmbeddingProviderError) {
        throw new ServiceUnavailableException({
          code: error.code,
          message: error.message
        });
      }
      throw error;
    }
  }

  private async searchVectors(
    context: TenantContext,
    queryVector: readonly number[],
    input: KnowledgeSearchRequest
  ): Promise<readonly VectorSearchHit[]> {
    try {
      return await this.vectorStore.search({
        vector: queryVector,
        tenantId: context.tenantId,
        limit: input.limit,
        ...(input.documentIds ? { documentIds: input.documentIds } : {})
      });
    } catch (error) {
      if (error instanceof VectorStoreError) {
        throw new ServiceUnavailableException({
          code: error.code,
          message: error.message
        });
      }
      throw error;
    }
  }

  private async recordAudit(
    principal: RequestPrincipal,
    input: Parameters<AuditService["record"]>[1]
  ): Promise<void> {
    try {
      await this.audit.record(principal, input);
    } catch (error) {
      this.logger.warn(
        `Audit write failed for ${input.action}: ${errorMessage(error)}`
      );
    }
  }

  private validateFile(file: UploadedMultipartFile | undefined): {
    originalName: string;
    mimeType: SupportedDocumentMimeType;
    size: number;
    buffer: Buffer;
  } {
    if (!file) {
      throw new BadRequestException("A document file is required.");
    }
    if (file.size <= 0 || file.size > maxDocumentUploadBytes) {
      throw new BadRequestException("Document file size is not allowed.");
    }
    const mimeType = supportedDocumentMimeTypeSchema.safeParse(file.mimetype);
    if (!mimeType.success) {
      throw new BadRequestException("Document MIME type is not supported.");
    }
    const cleanName = this.cleanFileName(file.originalname);
    if (!cleanName) {
      throw new BadRequestException("Document file name is not allowed.");
    }
    const expectedExtension = extensionByMimeType[mimeType.data];
    if (extname(cleanName).toLowerCase() !== expectedExtension) {
      throw new BadRequestException("Document extension is not supported.");
    }
    this.validateContent(mimeType.data, file.buffer);
    return {
      originalName: cleanName,
      mimeType: mimeType.data,
      size: file.size,
      buffer: file.buffer
    };
  }

  private cleanFileName(fileName: string): string {
    return fileName
      .replace(/[\\/]/g, "_")
      .split("")
      .filter((character) => {
        const code = character.charCodeAt(0);
        return code > 31 && code !== 127;
      })
      .join("")
      .trim()
      .slice(0, 255);
  }

  private validateContent(
    mimeType: SupportedDocumentMimeType,
    buffer: Buffer
  ): void {
    if (mimeType === "application/pdf") {
      if (!buffer.subarray(0, 5).equals(Buffer.from("%PDF-"))) {
        throw new BadRequestException("PDF signature is invalid.");
      }
      return;
    }
    if (buffer.includes(0)) {
      throw new BadRequestException("Text document contains binary content.");
    }
    try {
      textDecoder.decode(buffer);
    } catch {
      throw new BadRequestException("Text document must be valid UTF-8.");
    }
  }

  private toJob(
    principal: RequestPrincipal,
    documentId: string,
    storageKey: string,
    mimeType: SupportedDocumentMimeType,
    checksum: string
  ): DocumentIngestionJob {
    return {
      version: 1,
      tenantId: principal.tenantId,
      userId: principal.userId,
      correlationId: principal.sessionId,
      documentId,
      storageKey,
      mimeType,
      checksum
    };
  }

  private context(principal: RequestPrincipal): TenantContext {
    return {
      tenantId: principal.tenantId,
      userId: principal.userId,
      correlationId: principal.sessionId
    };
  }
}

function citationLabel(hit: VectorSearchHit): string {
  return `doc:${hit.payload.documentId.slice(0, 8)}#${hit.payload.ordinal}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error.";
}
