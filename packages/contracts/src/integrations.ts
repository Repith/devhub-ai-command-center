import { z } from "zod";

export const integrationProviderSchema = z.enum(["GMAIL", "GITHUB"]);
export type IntegrationProvider = z.infer<typeof integrationProviderSchema>;

export const integrationStatusSchema = z.enum([
  "CONNECTED",
  "DISCONNECTED",
  "EXPIRED",
  "MISCONFIGURED"
]);
export type IntegrationStatus = z.infer<typeof integrationStatusSchema>;

export const integrationErrorCodeSchema = z.enum([
  "EXTERNAL_CONNECTION_EXPIRED",
  "EXTERNAL_CONNECTION_NOT_FOUND",
  "GITHUB_ACTION_REVIEW_INVALID",
  "GITHUB_APP_MISCONFIGURED",
  "GITHUB_API_REQUEST_FAILED",
  "GITHUB_OAUTH_EXCHANGE_FAILED",
  "GITHUB_REPOSITORY_INVALID",
  "GITHUB_WEBHOOK_SIGNATURE_INVALID",
  "OAUTH_STATE_INVALID"
]);
export type IntegrationErrorCode = z.infer<typeof integrationErrorCodeSchema>;

export const externalConnectionStatusResponseSchema = z
  .object({
    provider: integrationProviderSchema,
    status: integrationStatusSchema,
    accountLabel: z.string().min(1).max(320).nullable(),
    scopes: z.array(z.string().min(1)),
    missingConfigKeys: z.array(z.string().min(1)).default([]),
    connectedAt: z.iso.datetime().nullable(),
    updatedAt: z.iso.datetime().nullable()
  })
  .strict();
export type ExternalConnectionStatusResponse = z.infer<
  typeof externalConnectionStatusResponseSchema
>;

export const integrationsStatusResponseSchema = z
  .object({
    data: z.array(externalConnectionStatusResponseSchema)
  })
  .strict();
export type IntegrationsStatusResponse = z.infer<
  typeof integrationsStatusResponseSchema
>;
