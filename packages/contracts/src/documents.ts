import { z } from "zod";

import { uuidSchema } from "./api.js";
import { documentStatusSchema } from "./statuses.js";

export const documentSchema = z.object({
  id: uuidSchema,
  fileName: z.string().min(1),
  mimeType: z.string().min(1),
  sizeBytes: z.number().int().nonnegative(),
  checksum: z.string().min(1),
  status: documentStatusSchema,
  failureCode: z.string().nullable(),
  failureDetail: z.string().nullable(),
  chunkCount: z.number().int().nonnegative(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime()
});
export type Document = z.infer<typeof documentSchema>;

export const documentListSchema = z.object({
  data: z.array(documentSchema),
  page: z.object({
    cursor: z.null(),
    nextCursor: z.null(),
    limit: z.number().int().min(1).max(100)
  })
});
export type DocumentList = z.infer<typeof documentListSchema>;

export const documentChunkSchema = z.object({
  id: uuidSchema,
  documentId: uuidSchema,
  ordinal: z.number().int().nonnegative(),
  content: z.string(),
  tokenCount: z.number().int().nonnegative().nullable(),
  pageNumber: z.number().int().positive().nullable(),
  createdAt: z.iso.datetime()
});
export type DocumentChunk = z.infer<typeof documentChunkSchema>;

export const documentChunkListSchema = z.object({
  data: z.array(documentChunkSchema),
  page: z.object({
    cursor: z.null(),
    nextCursor: z.null(),
    limit: z.number().int().min(1).max(1000)
  })
});
export type DocumentChunkList = z.infer<typeof documentChunkListSchema>;

export const supportedDocumentMimeTypes = [
  "text/markdown",
  "text/plain",
  "application/pdf"
] as const;

export const supportedDocumentMimeTypeSchema = z.enum(
  supportedDocumentMimeTypes
);
export type SupportedDocumentMimeType = z.infer<
  typeof supportedDocumentMimeTypeSchema
>;

export const documentIngestionJobSchema = z
  .object({
    version: z.literal(1),
    tenantId: uuidSchema,
    userId: uuidSchema,
    correlationId: z.string().min(1),
    documentId: uuidSchema,
    storageKey: z.string().min(1),
    mimeType: supportedDocumentMimeTypeSchema,
    checksum: z.string().min(1)
  })
  .strict();
export type DocumentIngestionJob = z.infer<typeof documentIngestionJobSchema>;
