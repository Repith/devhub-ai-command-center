import { z } from "zod";

import { uuidSchema } from "./api.js";

export const gmailConnectionStateSchema = z.enum([
  "DISCONNECTED",
  "CONNECTED",
  "MISCONFIGURED",
  "EXPIRED"
]);
export type GmailConnectionState = z.infer<typeof gmailConnectionStateSchema>;

export const gmailDraftReviewStatusSchema = z.enum([
  "NEEDS_REVIEW",
  "UPDATED",
  "SENT",
  "REJECTED"
]);
export type GmailDraftReviewStatus = z.infer<
  typeof gmailDraftReviewStatusSchema
>;

const recipientListSchema = z.array(z.email()).max(25);

export const gmailConnectionStatusSchema = z
  .object({
    status: gmailConnectionStateSchema,
    accountEmail: z.email().nullable(),
    scopes: z.array(z.string().min(1)),
    missingConfigKeys: z.array(z.string().min(1)).default([]),
    connectedAt: z.iso.datetime().nullable(),
    updatedAt: z.iso.datetime().nullable(),
    requiredScopes: z.array(z.string().min(1)),
    autoSendAllowed: z.boolean()
  })
  .strict();
export type GmailConnectionStatus = z.infer<typeof gmailConnectionStatusSchema>;

export const gmailConnectResponseSchema = z
  .object({
    authorizationUrl: z.url(),
    requiredScopes: z.array(z.string().min(1))
  })
  .strict();
export type GmailConnectResponse = z.infer<typeof gmailConnectResponseSchema>;

export const gmailDevConnectResponseSchema = gmailConnectionStatusSchema;
export type GmailDevConnectResponse = z.infer<
  typeof gmailDevConnectResponseSchema
>;

export const gmailOAuthCallbackSchema = z
  .object({
    code: z.string().min(1),
    state: z.string().min(1)
  })
  .strict();
export type GmailOAuthCallback = z.infer<typeof gmailOAuthCallbackSchema>;

export const gmailDraftReviewSchema = z
  .object({
    id: uuidSchema,
    agentRunId: uuidSchema.nullable(),
    threadId: z.string().min(1).max(256).nullable(),
    gmailDraftId: z.string().min(1).max(256).nullable(),
    to: recipientListSchema,
    cc: recipientListSchema,
    subject: z.string().min(1).max(500),
    body: z.string().min(1).max(50_000),
    status: gmailDraftReviewStatusSchema,
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    sentAt: z.iso.datetime().nullable()
  })
  .strict();
export type GmailDraftReview = z.infer<typeof gmailDraftReviewSchema>;

export const gmailDraftReviewListSchema = z
  .object({
    data: z.array(gmailDraftReviewSchema),
    page: z.object({
      cursor: z.null(),
      nextCursor: z.null(),
      limit: z.number().int().min(1).max(100)
    })
  })
  .strict();
export type GmailDraftReviewList = z.infer<typeof gmailDraftReviewListSchema>;

export const createGmailDraftReviewSchema = z
  .object({
    threadId: z.string().trim().min(1).max(256).optional(),
    gmailDraftId: z.string().trim().min(1).max(256).optional(),
    to: recipientListSchema.min(1),
    cc: recipientListSchema.default([]),
    subject: z.string().trim().min(1).max(500),
    body: z.string().trim().min(1).max(50_000)
  })
  .strict();
export type CreateGmailDraftReview = z.infer<
  typeof createGmailDraftReviewSchema
>;

export const updateGmailDraftReviewSchema = z
  .object({
    to: recipientListSchema.min(1).optional(),
    cc: recipientListSchema.optional(),
    subject: z.string().trim().min(1).max(500).optional(),
    body: z.string().trim().min(1).max(50_000).optional()
  })
  .strict()
  .refine((input) => Object.keys(input).length > 0, {
    message: "At least one field must be provided."
  });
export type UpdateGmailDraftReview = z.infer<
  typeof updateGmailDraftReviewSchema
>;
