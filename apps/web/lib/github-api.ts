import {
  githubConnectResponseSchema,
  githubConnectionStatusSchema,
  githubOAuthCallbackSchema,
  githubRepositoryListSchema,
  type GithubConnectResponse,
  type GithubConnectionStatus,
  type GithubOAuthCallback,
  type GithubRepository
} from "@devhub/contracts";

import { apiRequest } from "./api-client";

export function getGithubStatus(
  accessToken: string
): Promise<GithubConnectionStatus> {
  return apiRequest("/github/status", githubConnectionStatusSchema, {
    accessToken
  });
}

export function connectGithub(
  accessToken: string
): Promise<GithubConnectResponse> {
  return apiRequest("/github/connect", githubConnectResponseSchema, {
    method: "POST",
    accessToken
  });
}

export function completeGithubOAuth(
  accessToken: string,
  input: GithubOAuthCallback
): Promise<GithubConnectionStatus> {
  return apiRequest("/github/oauth/callback", githubConnectionStatusSchema, {
    method: "POST",
    accessToken,
    body: githubOAuthCallbackSchema.parse(input)
  });
}

export function syncGithubInstallations(
  accessToken: string
): Promise<GithubConnectionStatus> {
  return apiRequest(
    "/github/installations/sync",
    githubConnectionStatusSchema,
    {
      method: "POST",
      accessToken
    }
  );
}

export async function listGithubRepositories(
  accessToken: string
): Promise<GithubRepository[]> {
  const response = await apiRequest(
    "/github/repositories",
    githubRepositoryListSchema,
    { accessToken }
  );
  return response.data;
}

export function disconnectGithub(
  accessToken: string
): Promise<GithubConnectionStatus> {
  return apiRequest("/github/disconnect", githubConnectionStatusSchema, {
    method: "DELETE",
    accessToken
  });
}
