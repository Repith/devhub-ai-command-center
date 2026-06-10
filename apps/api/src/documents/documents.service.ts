import { createHash, randomUUID } from "node:crypto";
import { extname } from "node:path";

import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException
} from "@nestjs/common";

import {
  supportedDocumentMimeTypeSchema,
  type Document,
  type DocumentChunkList,
  type DocumentIngestionJob,
  type DocumentList,
  type SupportedDocumentMimeType
} from "@devhub/contracts";
import type { PrismaDocumentRepository } from "@devhub/database";
import type { TenantContext } from "@devhub/domain";

import type { RequestPrincipal } from "../auth/auth.types";
import { maxDocumentUploadBytes } from "./documents.config";
import {
  DOCUMENT_INGESTION_QUEUE,
  DOCUMENT_REPOSITORY
} from "./documents.tokens";
import type { DocumentIngestionQueue } from "./document-queue.service";
import { LocalDocumentStorage } from "./local-document-storage.service";

const extensionByMimeType: Record<SupportedDocumentMimeType, string> = {
  "text/markdown": ".md",
  "text/plain": ".txt",
  "application/pdf": ".pdf"
};

export interface UploadedMultipartFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

@Injectable()
export class DocumentsService {
  public constructor(
    @Inject(DOCUMENT_REPOSITORY)
    private readonly documents: PrismaDocumentRepository,
    @Inject(DOCUMENT_INGESTION_QUEUE)
    private readonly queue: DocumentIngestionQueue,
    @Inject(LocalDocumentStorage)
    private readonly storage: LocalDocumentStorage
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
    await this.queue.enqueue(
      this.toJob(principal, record.id, storageKey, valid.mimeType, checksum)
    );
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
    const expectedExtension = extensionByMimeType[mimeType.data];
    if (extname(file.originalname).toLowerCase() !== expectedExtension) {
      throw new BadRequestException("Document extension is not supported.");
    }
    return {
      originalName: file.originalname,
      mimeType: mimeType.data,
      size: file.size,
      buffer: file.buffer
    };
  }

  private cleanFileName(fileName: string): string {
    return fileName.replace(/[\\/]/g, "_").trim().slice(0, 255);
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
