import { z } from "zod";

import { uuidSchema } from "./api.js";
import { knowledgeSearchRequestSchema } from "./documents.js";

export const mcpToolIdSchema = z.enum([
  "knowledge.search",
  "news.fetch_rss",
  "gmail.search_threads",
  "gmail.get_thread",
  "gmail.create_draft",
  "gmail.update_draft"
]);
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

const gmailMessageIdSchema = z.string().min(1).max(256);
const gmailRecipientsSchema = z.array(z.email()).min(1).max(25);

export const gmailSearchThreadsInputSchema = z
  .object({
    query: z.string().trim().min(1).max(500),
    maxResults: z.number().int().min(1).max(20).default(10)
  })
  .strict();
export type GmailSearchThreadsInput = z.infer<
  typeof gmailSearchThreadsInputSchema
>;

export const gmailThreadSummarySchema = z
  .object({
    id: gmailMessageIdSchema,
    snippet: z.string().max(500),
    historyId: z.string().nullable()
  })
  .strict();
export type GmailThreadSummary = z.infer<typeof gmailThreadSummarySchema>;

export const gmailSearchThreadsOutputSchema = z
  .object({
    threads: z.array(gmailThreadSummarySchema).max(20)
  })
  .strict();
export type GmailSearchThreadsOutput = z.infer<
  typeof gmailSearchThreadsOutputSchema
>;

export const gmailGetThreadInputSchema = z
  .object({
    threadId: gmailMessageIdSchema
  })
  .strict();
export type GmailGetThreadInput = z.infer<typeof gmailGetThreadInputSchema>;

export const gmailThreadMessageSchema = z
  .object({
    id: gmailMessageIdSchema,
    threadId: gmailMessageIdSchema,
    internalDate: z.string().nullable(),
    from: z.string(),
    to: z.string(),
    subject: z.string(),
    snippet: z.string().max(500),
    bodyText: z.string().max(20_000)
  })
  .strict();
export type GmailThreadMessage = z.infer<typeof gmailThreadMessageSchema>;

export const gmailGetThreadOutputSchema = z
  .object({
    id: gmailMessageIdSchema,
    messages: z.array(gmailThreadMessageSchema).max(50)
  })
  .strict();
export type GmailGetThreadOutput = z.infer<typeof gmailGetThreadOutputSchema>;

export const gmailCreateDraftInputSchema = z
  .object({
    threadId: gmailMessageIdSchema.optional(),
    to: gmailRecipientsSchema,
    cc: z.array(z.email()).max(25).default([]),
    subject: z.string().trim().min(1).max(500),
    body: z.string().trim().min(1).max(50_000)
  })
  .strict();
export type GmailCreateDraftInput = z.infer<typeof gmailCreateDraftInputSchema>;

export const gmailUpdateDraftInputSchema = gmailCreateDraftInputSchema
  .extend({
    draftId: gmailMessageIdSchema
  })
  .strict();
export type GmailUpdateDraftInput = z.infer<typeof gmailUpdateDraftInputSchema>;

export const gmailDraftMutationOutputSchema = z
  .object({
    draftId: gmailMessageIdSchema,
    messageId: gmailMessageIdSchema.nullable(),
    threadId: gmailMessageIdSchema.nullable()
  })
  .strict();
export type GmailDraftMutationOutput = z.infer<
  typeof gmailDraftMutationOutputSchema
>;
