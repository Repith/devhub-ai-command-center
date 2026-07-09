import { z } from "zod";

import { uuidSchema } from "./api.js";
import { integrationStatusSchema } from "./integrations.js";

export const githubConnectionStatusSchema = z
  .object({
    provider: z.literal("GITHUB"),
    status: integrationStatusSchema,
    accountLogin: z.string().min(1).max(320).nullable(),
    scopes: z.array(z.string().min(1)),
    missingConfigKeys: z.array(z.string().min(1)).default([]),
    connectedAt: z.iso.datetime().nullable(),
    updatedAt: z.iso.datetime().nullable(),
    installationCount: z.number().int().min(0),
    repositoryCount: z.number().int().min(0)
  })
  .strict();
export type GithubConnectionStatus = z.infer<
  typeof githubConnectionStatusSchema
>;

export const githubConnectResponseSchema = z
  .object({
    authorizationUrl: z.url()
  })
  .strict();
export type GithubConnectResponse = z.infer<typeof githubConnectResponseSchema>;

export const githubOAuthCallbackSchema = z
  .object({
    code: z.string().min(1),
    state: z.string().min(1)
  })
  .strict();
export type GithubOAuthCallback = z.infer<typeof githubOAuthCallbackSchema>;

export const githubRepositorySchema = z
  .object({
    id: uuidSchema,
    installationId: uuidSchema,
    providerRepositoryId: z.string().min(1),
    owner: z.string().min(1).max(255),
    name: z.string().min(1).max(255),
    fullName: z.string().min(1).max(512),
    private: z.boolean(),
    defaultBranch: z.string().min(1).max(255).nullable(),
    htmlUrl: z.url(),
    updatedAt: z.iso.datetime()
  })
  .strict();
export type GithubRepository = z.infer<typeof githubRepositorySchema>;

export const githubRepositoryListSchema = z
  .object({
    data: z.array(githubRepositorySchema)
  })
  .strict();
export type GithubRepositoryList = z.infer<typeof githubRepositoryListSchema>;

export const githubActionReviewKindSchema = z.enum([
  "ISSUE_COMMENT",
  "PULL_REQUEST_COMMENT",
  "ISSUE_CREATION"
]);
export type GithubActionReviewKind = z.infer<
  typeof githubActionReviewKindSchema
>;

export const githubActionReviewStatusSchema = z.enum([
  "NEEDS_REVIEW",
  "UPDATED",
  "SENT",
  "REJECTED"
]);
export type GithubActionReviewStatus = z.infer<
  typeof githubActionReviewStatusSchema
>;

const githubReviewBodySchema = z.string().trim().min(1).max(50_000);
const githubReviewTitleSchema = z.string().trim().min(1).max(500);
const githubIssueNumberSchema = z.number().int().positive().max(1_000_000_000);

export const githubActionReviewSchema = z
  .object({
    id: uuidSchema,
    repositoryId: uuidSchema,
    repositoryFullName: z.string().min(1).max(512),
    kind: githubActionReviewKindSchema,
    issueNumber: githubIssueNumberSchema.nullable(),
    pullRequestNumber: githubIssueNumberSchema.nullable(),
    title: z.string().min(1).max(500).nullable(),
    body: z.string().min(1).max(50_000),
    status: githubActionReviewStatusSchema,
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    sentAt: z.iso.datetime().nullable(),
    externalUrl: z.url().nullable()
  })
  .strict();
export type GithubActionReview = z.infer<typeof githubActionReviewSchema>;

export const githubActionReviewListSchema = z
  .object({
    data: z.array(githubActionReviewSchema),
    page: z.object({
      cursor: z.null(),
      nextCursor: z.null(),
      limit: z.number().int().min(1).max(100)
    })
  })
  .strict();
export type GithubActionReviewList = z.infer<
  typeof githubActionReviewListSchema
>;

export const createGithubActionReviewSchema = z
  .object({
    repositoryFullName: z.string().trim().min(1).max(512),
    kind: githubActionReviewKindSchema,
    issueNumber: githubIssueNumberSchema.optional(),
    pullRequestNumber: githubIssueNumberSchema.optional(),
    title: githubReviewTitleSchema.optional(),
    body: githubReviewBodySchema
  })
  .strict()
  .superRefine((input, context) => {
    if (input.kind === "ISSUE_COMMENT" && !input.issueNumber) {
      context.addIssue({
        code: "custom",
        path: ["issueNumber"],
        message: "Issue comment reviews require an issue number."
      });
    }
    if (input.kind === "PULL_REQUEST_COMMENT" && !input.pullRequestNumber) {
      context.addIssue({
        code: "custom",
        path: ["pullRequestNumber"],
        message: "Pull request comment reviews require a pull request number."
      });
    }
    if (input.kind === "ISSUE_CREATION" && !input.title) {
      context.addIssue({
        code: "custom",
        path: ["title"],
        message: "Issue creation reviews require a title."
      });
    }
  });
export type CreateGithubActionReview = z.infer<
  typeof createGithubActionReviewSchema
>;

export const updateGithubActionReviewSchema = z
  .object({
    title: githubReviewTitleSchema.optional(),
    body: githubReviewBodySchema.optional()
  })
  .strict()
  .refine((input) => Object.keys(input).length > 0, {
    message: "At least one field must be provided."
  });
export type UpdateGithubActionReview = z.infer<
  typeof updateGithubActionReviewSchema
>;
