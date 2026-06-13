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

export const knowledgeSearchRequestSchema = z
  .object({
    query: z.string().trim().min(1).max(4000),
    limit: z.number().int().min(1).max(20).default(5),
    documentIds: z.array(uuidSchema).max(50).optional()
  })
  .strict();
export type KnowledgeSearchRequest = z.infer<
  typeof knowledgeSearchRequestSchema
>;

export const knowledgeSearchResultSchema = z.object({
  citationLabel: z.string().min(1),
  score: z.number(),
  documentId: uuidSchema,
  chunkId: uuidSchema,
  fileName: z.string().min(1),
  ordinal: z.number().int().nonnegative(),
  pageNumber: z.number().int().positive().nullable(),
  content: z.string()
});
export type KnowledgeSearchResult = z.infer<typeof knowledgeSearchResultSchema>;

export const knowledgeSearchResponseSchema = z.object({
  query: z.string(),
  answer: z.string(),
  results: z.array(knowledgeSearchResultSchema)
});
export type KnowledgeSearchResponse = z.infer<
  typeof knowledgeSearchResponseSchema
>;

const knowledgeSearchStreamEventBaseSchema = z.object({
  version: z.literal(1)
});

export const knowledgeSearchStreamEventSchema = z.discriminatedUnion("type", [
  knowledgeSearchStreamEventBaseSchema.extend({
    type: z.literal("knowledge.search.started"),
    query: z.string(),
    results: z.array(knowledgeSearchResultSchema)
  }),
  knowledgeSearchStreamEventBaseSchema.extend({
    type: z.literal("knowledge.search.delta"),
    text: z.string().min(1)
  }),
  knowledgeSearchStreamEventBaseSchema.extend({
    type: z.literal("knowledge.search.completed"),
    answer: z.string()
  }),
  knowledgeSearchStreamEventBaseSchema.extend({
    type: z.literal("knowledge.search.error"),
    code: z.string().min(1),
    message: z.string().min(1)
  })
]);
export type KnowledgeSearchStreamEvent = z.infer<
  typeof knowledgeSearchStreamEventSchema
>;

export const supportedDocumentMimeTypes = [
  "text/markdown",
  "text/plain",
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp"
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
