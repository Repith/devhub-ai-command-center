import { z } from "zod";

import { uuidSchema } from "./api.js";
import { knowledgeSearchRequestSchema } from "./documents.js";
import {
  usageSummaryToolInputSchema,
  usageSummaryToolOutputSchema
} from "./usage.js";

export const mcpToolIdSchema = z.enum([
  "knowledge.search",
  "news.fetch_rss",
  "usage.summary",
  "gmail.search_threads",
  "gmail.get_thread",
  "gmail.create_draft",
  "gmail.update_draft",
  "github.list_repositories",
  "github.get_file",
  "github.search_code",
  "github.list_issues",
  "github.list_pull_requests",
  "github.get_pull_request"
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

export const usageSummaryToolInputContractSchema = usageSummaryToolInputSchema;
export type UsageSummaryToolInputContract = z.infer<
  typeof usageSummaryToolInputContractSchema
>;

export const usageSummaryToolOutputContractSchema =
  usageSummaryToolOutputSchema;
export type UsageSummaryToolOutputContract = z.infer<
  typeof usageSummaryToolOutputContractSchema
>;

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

const githubRepositoryFullNameSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/)
  .max(512);
const githubPathSchema = z.string().trim().min(1).max(1000);

export const githubListRepositoriesInputSchema = z.object({}).strict();
export type GithubListRepositoriesInput = z.infer<
  typeof githubListRepositoriesInputSchema
>;

export const githubRepositorySummarySchema = z
  .object({
    fullName: githubRepositoryFullNameSchema,
    owner: z.string().min(1).max(255),
    name: z.string().min(1).max(255),
    private: z.boolean(),
    defaultBranch: z.string().min(1).max(255).nullable(),
    htmlUrl: z.url()
  })
  .strict();
export type GithubRepositorySummary = z.infer<
  typeof githubRepositorySummarySchema
>;

export const githubListRepositoriesOutputSchema = z
  .object({
    repositories: z.array(githubRepositorySummarySchema).max(100)
  })
  .strict();
export type GithubListRepositoriesOutput = z.infer<
  typeof githubListRepositoriesOutputSchema
>;

export const githubGetFileInputSchema = z
  .object({
    repositoryFullName: githubRepositoryFullNameSchema,
    path: githubPathSchema,
    ref: z.string().trim().min(1).max(255).optional()
  })
  .strict();
export type GithubGetFileInput = z.infer<typeof githubGetFileInputSchema>;

export const githubGetFileOutputSchema = z
  .object({
    repositoryFullName: githubRepositoryFullNameSchema,
    path: githubPathSchema,
    ref: z.string().nullable(),
    text: z.string().max(50_000),
    htmlUrl: z.url().nullable()
  })
  .strict();
export type GithubGetFileOutput = z.infer<typeof githubGetFileOutputSchema>;

export const githubSearchCodeInputSchema = z
  .object({
    repositoryFullName: githubRepositoryFullNameSchema,
    query: z.string().trim().min(1).max(500),
    limit: z.number().int().min(1).max(20).default(10)
  })
  .strict();
export type GithubSearchCodeInput = z.infer<typeof githubSearchCodeInputSchema>;

export const githubSearchCodeResultSchema = z
  .object({
    repositoryFullName: githubRepositoryFullNameSchema,
    path: githubPathSchema,
    name: z.string().min(1).max(255),
    htmlUrl: z.url(),
    score: z.number().nonnegative()
  })
  .strict();
export type GithubSearchCodeResult = z.infer<
  typeof githubSearchCodeResultSchema
>;

export const githubSearchCodeOutputSchema = z
  .object({
    results: z.array(githubSearchCodeResultSchema).max(20)
  })
  .strict();
export type GithubSearchCodeOutput = z.infer<
  typeof githubSearchCodeOutputSchema
>;

export const githubListIssuesInputSchema = z
  .object({
    repositoryFullName: githubRepositoryFullNameSchema,
    state: z.enum(["open", "closed", "all"]).default("open"),
    limit: z.number().int().min(1).max(20).default(10)
  })
  .strict();
export type GithubListIssuesInput = z.infer<typeof githubListIssuesInputSchema>;

export const githubIssueSummarySchema = z
  .object({
    number: z.number().int().positive(),
    title: z.string().min(1).max(500),
    state: z.string().min(1).max(40),
    htmlUrl: z.url(),
    authorLogin: z.string().min(1).max(255).nullable(),
    updatedAt: z.iso.datetime().nullable()
  })
  .strict();
export type GithubIssueSummary = z.infer<typeof githubIssueSummarySchema>;

export const githubListIssuesOutputSchema = z
  .object({
    issues: z.array(githubIssueSummarySchema).max(20)
  })
  .strict();
export type GithubListIssuesOutput = z.infer<
  typeof githubListIssuesOutputSchema
>;

export const githubListPullRequestsInputSchema = githubListIssuesInputSchema;
export type GithubListPullRequestsInput = z.infer<
  typeof githubListPullRequestsInputSchema
>;

export const githubPullRequestSummarySchema = githubIssueSummarySchema.extend({
  merged: z.boolean().nullable()
});
export type GithubPullRequestSummary = z.infer<
  typeof githubPullRequestSummarySchema
>;

export const githubListPullRequestsOutputSchema = z
  .object({
    pullRequests: z.array(githubPullRequestSummarySchema).max(20)
  })
  .strict();
export type GithubListPullRequestsOutput = z.infer<
  typeof githubListPullRequestsOutputSchema
>;

export const githubGetPullRequestInputSchema = z
  .object({
    repositoryFullName: githubRepositoryFullNameSchema,
    number: z.number().int().positive()
  })
  .strict();
export type GithubGetPullRequestInput = z.infer<
  typeof githubGetPullRequestInputSchema
>;

export const githubGetPullRequestOutputSchema = githubPullRequestSummarySchema
  .extend({
    body: z.string().max(20_000).nullable(),
    baseRef: z.string().min(1).max(255),
    headRef: z.string().min(1).max(255),
    changedFiles: z.number().int().nonnegative(),
    additions: z.number().int().nonnegative(),
    deletions: z.number().int().nonnegative()
  })
  .strict();
export type GithubGetPullRequestOutput = z.infer<
  typeof githubGetPullRequestOutputSchema
>;
