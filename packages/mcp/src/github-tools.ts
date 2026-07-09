import type {
  GithubGetFileInput,
  GithubGetFileOutput,
  GithubGetPullRequestInput,
  GithubGetPullRequestOutput,
  GithubListIssuesInput,
  GithubListIssuesOutput,
  GithubListPullRequestsInput,
  GithubListPullRequestsOutput,
  GithubListRepositoriesInput,
  GithubListRepositoriesOutput,
  GithubSearchCodeInput,
  GithubSearchCodeOutput,
  McpTenantContext
} from "@devhub/contracts";
import {
  githubGetFileInputSchema,
  githubGetFileOutputSchema,
  githubGetPullRequestInputSchema,
  githubGetPullRequestOutputSchema,
  githubListIssuesInputSchema,
  githubListIssuesOutputSchema,
  githubListPullRequestsInputSchema,
  githubListPullRequestsOutputSchema,
  githubListRepositoriesInputSchema,
  githubListRepositoriesOutputSchema,
  githubSearchCodeInputSchema,
  githubSearchCodeOutputSchema
} from "@devhub/contracts";

import { GithubRestClient } from "./github-client.js";
import type { ToolDefinition } from "./tool-registry.js";

export interface GithubRepositoryAccess {
  fullName: string;
  owner: string;
  name: string;
  private: boolean;
  defaultBranch: string | null;
  htmlUrl: string;
}

export interface GithubRepositoryAuthorization {
  providerInstallationId?: string;
}

export interface GithubToolOptions {
  assertRepositoryAccess(
    context: McpTenantContext,
    repositoryFullName: string
  ): Promise<GithubRepositoryAuthorization>;
  getAccessToken(
    context: McpTenantContext,
    authorization?: GithubRepositoryAuthorization
  ): Promise<string>;
  listRepositories(
    context: McpTenantContext
  ): Promise<readonly GithubRepositoryAccess[]>;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

export function createGithubListRepositoriesTool(
  options: GithubToolOptions
): ToolDefinition<GithubListRepositoriesInput, GithubListRepositoriesOutput> {
  return {
    id: "github.list_repositories",
    description: "List tenant-authorized GitHub repositories.",
    inputSchema: githubListRepositoriesInputSchema,
    outputSchema: githubListRepositoriesOutputSchema,
    execute: async (_input, context) => ({
      repositories: (await options.listRepositories(context))
        .slice(0, 100)
        .map((repo) => ({ ...repo }))
    })
  };
}

export function createGithubGetFileTool(
  options: GithubToolOptions
): ToolDefinition<GithubGetFileInput, GithubGetFileOutput> {
  return {
    id: "github.get_file",
    description: "Read a bounded file from an authorized GitHub repository.",
    inputSchema: githubGetFileInputSchema,
    outputSchema: githubGetFileOutputSchema,
    execute: async (input, context) => {
      const authorization = await options.assertRepositoryAccess(
        context,
        input.repositoryFullName
      );
      return (await client(options, context, authorization)).getFile({
        repositoryFullName: input.repositoryFullName,
        path: input.path,
        ...(input.ref === undefined ? {} : { ref: input.ref })
      });
    }
  };
}

export function createGithubSearchCodeTool(
  options: GithubToolOptions
): ToolDefinition<GithubSearchCodeInput, GithubSearchCodeOutput> {
  return {
    id: "github.search_code",
    description: "Search code inside one authorized GitHub repository.",
    inputSchema: githubSearchCodeInputSchema,
    outputSchema: githubSearchCodeOutputSchema,
    execute: async (input, context) => {
      const authorization = await options.assertRepositoryAccess(
        context,
        input.repositoryFullName
      );
      return (await client(options, context, authorization)).searchCode(input);
    }
  };
}

export function createGithubListIssuesTool(
  options: GithubToolOptions
): ToolDefinition<GithubListIssuesInput, GithubListIssuesOutput> {
  return {
    id: "github.list_issues",
    description: "List issues from an authorized GitHub repository.",
    inputSchema: githubListIssuesInputSchema,
    outputSchema: githubListIssuesOutputSchema,
    execute: async (input, context) => {
      const authorization = await options.assertRepositoryAccess(
        context,
        input.repositoryFullName
      );
      return (await client(options, context, authorization)).listIssues(input);
    }
  };
}

export function createGithubListPullRequestsTool(
  options: GithubToolOptions
): ToolDefinition<GithubListPullRequestsInput, GithubListPullRequestsOutput> {
  return {
    id: "github.list_pull_requests",
    description: "List pull requests from an authorized GitHub repository.",
    inputSchema: githubListPullRequestsInputSchema,
    outputSchema: githubListPullRequestsOutputSchema,
    execute: async (input, context) => {
      const authorization = await options.assertRepositoryAccess(
        context,
        input.repositoryFullName
      );
      return (await client(options, context, authorization)).listPullRequests(
        input
      );
    }
  };
}

export function createGithubGetPullRequestTool(
  options: GithubToolOptions
): ToolDefinition<GithubGetPullRequestInput, GithubGetPullRequestOutput> {
  return {
    id: "github.get_pull_request",
    description: "Get one pull request from an authorized GitHub repository.",
    inputSchema: githubGetPullRequestInputSchema,
    outputSchema: githubGetPullRequestOutputSchema,
    execute: async (input, context) => {
      const authorization = await options.assertRepositoryAccess(
        context,
        input.repositoryFullName
      );
      return (await client(options, context, authorization)).getPullRequest(
        input
      );
    }
  };
}

export function createGithubTools(
  options: GithubToolOptions
): readonly ToolDefinition<unknown, unknown>[] {
  return [
    createGithubListRepositoriesTool(options),
    createGithubGetFileTool(options),
    createGithubSearchCodeTool(options),
    createGithubListIssuesTool(options),
    createGithubListPullRequestsTool(options),
    createGithubGetPullRequestTool(options)
  ];
}

async function client(
  options: GithubToolOptions,
  context: McpTenantContext,
  authorization?: GithubRepositoryAuthorization
): Promise<GithubRestClient> {
  return new GithubRestClient({
    accessToken: await options.getAccessToken(context, authorization),
    ...(options.fetch ? { fetch: options.fetch } : {}),
    ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs })
  });
}
