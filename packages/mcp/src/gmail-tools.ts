import type {
  GmailCreateDraftInput,
  GmailDraftMutationOutput,
  GmailGetThreadInput,
  GmailGetThreadOutput,
  GmailSearchThreadsInput,
  GmailSearchThreadsOutput,
  GmailUpdateDraftInput,
  McpTenantContext
} from "@devhub/contracts";
import {
  gmailCreateDraftInputSchema,
  gmailDraftMutationOutputSchema,
  gmailGetThreadInputSchema,
  gmailGetThreadOutputSchema,
  gmailSearchThreadsInputSchema,
  gmailSearchThreadsOutputSchema,
  gmailUpdateDraftInputSchema
} from "@devhub/contracts";

import { GmailRestClient } from "./gmail-client.js";
import type { ToolDefinition } from "./tool-registry.js";

export interface GmailToolOptions {
  getAccessToken(context: McpTenantContext): Promise<string>;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

export function createGmailSearchThreadsTool(
  options: GmailToolOptions
): ToolDefinition<GmailSearchThreadsInput, GmailSearchThreadsOutput> {
  return {
    id: "gmail.search_threads",
    description: "Search Gmail threads for the authenticated user.",
    inputSchema: gmailSearchThreadsInputSchema,
    outputSchema: gmailSearchThreadsOutputSchema,
    execute: async (input, context) => ({
      threads: [
        ...(await client(options, context).searchThreads(
          input.query,
          input.maxResults
        ))
      ]
    })
  };
}

export function createGmailGetThreadTool(
  options: GmailToolOptions
): ToolDefinition<GmailGetThreadInput, GmailGetThreadOutput> {
  return {
    id: "gmail.get_thread",
    description: "Read a bounded Gmail thread for summarization or drafting.",
    inputSchema: gmailGetThreadInputSchema,
    outputSchema: gmailGetThreadOutputSchema,
    execute: (input, context) =>
      client(options, context).getThread(input.threadId)
  };
}

export function createGmailCreateDraftTool(
  options: GmailToolOptions
): ToolDefinition<GmailCreateDraftInput, GmailDraftMutationOutput> {
  return {
    id: "gmail.create_draft",
    description: "Create a Gmail draft. This tool cannot send mail.",
    inputSchema: gmailCreateDraftInputSchema,
    outputSchema: gmailDraftMutationOutputSchema,
    execute: (input, context) =>
      client(options, context).createDraft(toMessageInput(input))
  };
}

export function createGmailUpdateDraftTool(
  options: GmailToolOptions
): ToolDefinition<GmailUpdateDraftInput, GmailDraftMutationOutput> {
  return {
    id: "gmail.update_draft",
    description: "Update a Gmail draft. This tool cannot send mail.",
    inputSchema: gmailUpdateDraftInputSchema,
    outputSchema: gmailDraftMutationOutputSchema,
    execute: (input, context) =>
      client(options, context).updateDraft(input.draftId, toMessageInput(input))
  };
}

export function createGmailTools(
  options: GmailToolOptions
): readonly ToolDefinition<unknown, unknown>[] {
  return [
    createGmailSearchThreadsTool(options),
    createGmailGetThreadTool(options),
    createGmailCreateDraftTool(options),
    createGmailUpdateDraftTool(options)
  ];
}

function client(
  options: GmailToolOptions,
  context: McpTenantContext
): GmailRestClient {
  return new GmailRestClient({
    accessToken: "",
    fetch: async (input, init) => {
      const accessToken = await options.getAccessToken(context);
      const headers = new Headers(init?.headers);
      headers.set("Authorization", `Bearer ${accessToken}`);
      return (options.fetch ?? fetch)(input, { ...init, headers });
    },
    ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs })
  });
}

function toMessageInput(input: GmailCreateDraftInput | GmailUpdateDraftInput): {
  threadId?: string;
  to: readonly string[];
  cc: readonly string[];
  subject: string;
  body: string;
} {
  return {
    ...(input.threadId === undefined ? {} : { threadId: input.threadId }),
    to: input.to,
    cc: input.cc,
    subject: input.subject,
    body: input.body
  };
}
