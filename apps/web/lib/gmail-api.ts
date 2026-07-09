import {
  createGmailDraftReviewSchema,
  gmailConnectResponseSchema,
  gmailConnectionStatusSchema,
  gmailDraftReviewListSchema,
  gmailDraftReviewSchema,
  gmailOAuthCallbackSchema,
  type CreateGmailDraftReview,
  type GmailConnectResponse,
  type GmailConnectionStatus,
  type GmailOAuthCallback,
  type GmailDraftReview,
  type UpdateGmailDraftReview
} from "@devhub/contracts";

import { apiRequest } from "./api-client";

export function getGmailStatus(
  accessToken: string
): Promise<GmailConnectionStatus> {
  return apiRequest("/gmail/status", gmailConnectionStatusSchema, {
    accessToken
  });
}

export function connectGmail(
  accessToken: string
): Promise<GmailConnectResponse> {
  return apiRequest("/gmail/connect", gmailConnectResponseSchema, {
    method: "POST",
    accessToken
  });
}

export function completeGmailOAuth(
  accessToken: string,
  input: GmailOAuthCallback
): Promise<GmailConnectionStatus> {
  return apiRequest("/gmail/oauth/callback", gmailConnectionStatusSchema, {
    method: "POST",
    accessToken,
    body: gmailOAuthCallbackSchema.parse(input)
  });
}

export function connectGmailDevMock(
  accessToken: string
): Promise<GmailConnectionStatus> {
  return apiRequest("/gmail/dev/connect", gmailConnectionStatusSchema, {
    method: "POST",
    accessToken
  });
}

export async function listGmailDraftReviews(
  accessToken: string
): Promise<GmailDraftReview[]> {
  const response = await apiRequest(
    "/gmail/draft-reviews",
    gmailDraftReviewListSchema,
    { accessToken }
  );
  return response.data;
}

export function createGmailDraftReview(
  accessToken: string,
  input: CreateGmailDraftReview
): Promise<GmailDraftReview> {
  return apiRequest("/gmail/draft-reviews", gmailDraftReviewSchema, {
    method: "POST",
    accessToken,
    body: createGmailDraftReviewSchema.parse(input)
  });
}

export function updateGmailDraftReview(
  accessToken: string,
  reviewId: string,
  input: UpdateGmailDraftReview
): Promise<GmailDraftReview> {
  return apiRequest(
    `/gmail/draft-reviews/${reviewId}`,
    gmailDraftReviewSchema,
    {
      method: "PATCH",
      accessToken,
      body: input
    }
  );
}

export function sendGmailDraftReview(
  accessToken: string,
  reviewId: string
): Promise<GmailDraftReview> {
  return apiRequest(
    `/gmail/draft-reviews/${reviewId}/send`,
    gmailDraftReviewSchema,
    {
      method: "POST",
      accessToken
    }
  );
}

export function rejectGmailDraftReview(
  accessToken: string,
  reviewId: string
): Promise<GmailDraftReview> {
  return apiRequest(
    `/gmail/draft-reviews/${reviewId}/reject`,
    gmailDraftReviewSchema,
    {
      method: "POST",
      accessToken
    }
  );
}
