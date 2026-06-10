import { z } from "zod";

import { uuidSchema } from "./api.js";
import { knowledgeSearchRequestSchema } from "./documents.js";

export const mcpToolIdSchema = z.enum(["knowledge.search", "news.fetch_rss"]);
export type McpToolId = z.infer<typeof mcpToolIdSchema>;

export const mcpTenantContextSchema = z
  .object({
    tenantId: uuidSchema,
    userId: uuidSchema,
    correlationId: z.string().min(1)
  })
  .strict();
export type McpTenantContext = z.infer<typeof mcpTenantContextSchema>;

export const mcpToolCallSchema = z
  .object({
    toolId: mcpToolIdSchema,
    agentId: uuidSchema,
    input: z.unknown()
  })
  .strict();
export type McpToolCall = z.infer<typeof mcpToolCallSchema>;

export const mcpToolAuditEntrySchema = z
  .object({
    toolId: mcpToolIdSchema,
    agentId: uuidSchema,
    tenantId: uuidSchema,
    correlationId: z.string().min(1),
    status: z.enum(["COMPLETED", "FAILED", "DENIED"]),
    inputPreview: z.string(),
    outputPreview: z.string().nullable(),
    errorCode: z.string().nullable(),
    durationMs: z.number().int().nonnegative()
  })
  .strict();
export type McpToolAuditEntry = z.infer<typeof mcpToolAuditEntrySchema>;

export const knowledgeSearchToolInputSchema = knowledgeSearchRequestSchema;
export type KnowledgeSearchToolInput = z.infer<
  typeof knowledgeSearchToolInputSchema
>;

export const rssItemSchema = z
  .object({
    title: z.string(),
    url: z.url().nullable(),
    publishedAt: z.string().nullable(),
    summary: z.string()
  })
  .strict();
export type RssItem = z.infer<typeof rssItemSchema>;

export const newsFetchRssInputSchema = z
  .object({
    url: z.url(),
    limit: z.number().int().min(1).max(20).default(5)
  })
  .strict();
export type NewsFetchRssInput = z.infer<typeof newsFetchRssInputSchema>;

export const newsFetchRssOutputSchema = z
  .object({
    sourceUrl: z.url(),
    items: z.array(rssItemSchema).max(20)
  })
  .strict();
export type NewsFetchRssOutput = z.infer<typeof newsFetchRssOutputSchema>;
