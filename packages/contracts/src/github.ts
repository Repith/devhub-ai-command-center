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
