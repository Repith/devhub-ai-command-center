import type {
  AgentRunJob,
  AgentRunConfigSnapshot,
  CreateAgentRun
} from "@devhub/contracts";
import { agentRunConfigSnapshotSchema } from "@devhub/contracts";
import type { EmbeddingProviderPort, LlmProviderPort } from "@devhub/ai";
import {
  PrismaAgentRunRepository,
  PrismaConversationRepository,
  PrismaDocumentRepository,
  PrismaExternalConnectionRepository,
  PrismaGmailDraftReviewRepository,
  PrismaNewsFeedRepository,
  PrismaAuditLogRepository,
  PrismaUsageRepository,
  type DatabaseClient
} from "@devhub/database";
import type { TenantContext } from "@devhub/domain";
import {
  createGmailTools,
  createKnowledgeSearchTool,
  createNewsFetchRssTool,
  createUsageSummaryTool,
  StaticToolRegistry
} from "@devhub/mcp";
import type { VectorStorePort } from "@devhub/rag";
import { createAgentRunGraph } from "./agent-graph/agent-run-graph.js";
import {
  initialGraphState,
  type AgentRunGraphStateValue
} from "./agent-graph/agent-graph-state.js";
import {
  AgentStepRunner,
  type AgentStepRunnerDependencies
} from "./agent-graph/agent-step-runner.js";
import { compileAgentWorkflowDefinition } from "./agent-graph/workflow-compiler.js";
import { GmailAccessTokenProvider } from "./gmail-access-token-provider.js";
import type { RealtimeEventPublisher } from "./realtime-event-publisher.js";
import { PrismaToolAuditSink } from "./tool-audit-sink.js";

export interface AgentRunGmailOptions {
  clientId?: string | undefined;
  clientSecret?: string | undefined;
  devMockEnabled?: boolean | undefined;
  timeoutMs: number;
  tokenEncryptionKey: string;
}

export interface AgentRunProcessorOptions {
  database: DatabaseClient;
  embeddingModel: string;
  embeddingProvider: EmbeddingProviderPort;
  embeddingTimeoutMs: number;
  llmProvider: LlmProviderPort;
  gmail?: AgentRunGmailOptions;
  publisher?: RealtimeEventPublisher;
  retryCount?: number;
  vectorStore: VectorStorePort;
  rssTimeoutMs: number;
}

export type AgentRunProcessorDependencies = AgentStepRunnerDependencies;

export async function processAgentRun(
  options: AgentRunProcessorOptions & { input: AgentRunJob }
): Promise<void> {
  const documents = new PrismaDocumentRepository(options.database);
  const conversations = new PrismaConversationRepository(options.database);
  const connections = new PrismaExternalConnectionRepository(options.database);
  const draftReviews = new PrismaGmailDraftReviewRepository(options.database);
  const newsFeeds = new PrismaNewsFeedRepository(options.database);
  const runs = new PrismaAgentRunRepository(options.database);
  const usage = new PrismaUsageRepository(options.database);
  const toolAudit = new PrismaToolAuditSink(
    new PrismaAuditLogRepository(options.database)
  );
  const gmailAccessTokens = options.gmail?.devMockEnabled
    ? null
    : options.gmail
      ? new GmailAccessTokenProvider({
          clientId: options.gmail.clientId,
          clientSecret: options.gmail.clientSecret,
          connections,
          tokenEncryptionKey: options.gmail.tokenEncryptionKey
        })
      : null;
  const tools = new StaticToolRegistry(
    [
      createKnowledgeSearchTool({
        documents,
        embeddingModel: options.embeddingModel,
        embeddingProvider: options.embeddingProvider,
        embeddingTimeoutMs: options.embeddingTimeoutMs,
        vectorStore: options.vectorStore
      }),
      createNewsFetchRssTool({ timeoutMs: options.rssTimeoutMs }),
      createUsageSummaryTool({ usage }),
      ...(options.gmail?.devMockEnabled
        ? createGmailTools({
            getAccessToken: () => Promise.resolve("devhub-gmail-mock-token"),
            fetch: gmailDevMockFetch,
            timeoutMs: options.gmail.timeoutMs
          })
        : gmailAccessTokens
          ? createGmailTools({
              getAccessToken: (context) =>
                gmailAccessTokens.getAccessToken(context),
              timeoutMs: options.gmail!.timeoutMs
            })
          : [])
    ],
    toolAudit
  );
  const processor = new AgentRunProcessor({
    llmProvider: options.llmProvider,
    ...(options.publisher ? { publisher: options.publisher } : {}),
    conversations,
    draftReviews,
    newsFeeds,
    retryCount: options.retryCount ?? 0,
    runs,
    tools,
    usage
  });
  await processor.process(options.input);
}

const gmailMockThreadId = "mock-thread-release";

async function gmailDevMockFetch(
  input: string | URL | Request,
  init?: RequestInit
): Promise<Response> {
  const url = new URL(requestUrl(input));
  const path = url.pathname;
  const method = init?.method ?? "GET";
  if (method === "GET" && path.endsWith("/threads")) {
    return jsonResponse({ threads: [{ id: gmailMockThreadId }] });
  }
  if (method === "GET" && path.includes(`/threads/${gmailMockThreadId}`)) {
    return jsonResponse({
      id: gmailMockThreadId,
      historyId: "mock-history-1",
      messages: [
        {
          id: "mock-message-1",
          threadId: gmailMockThreadId,
          internalDate: String(Date.now()),
          snippet: "Mock customer asks about the release stabilization plan.",
          payload: {
            headers: [
              { name: "From", value: "customer@example.com" },
              { name: "To", value: "owner@example.com" },
              { name: "Subject", value: "Release stabilization" }
            ],
            mimeType: "text/plain",
            body: {
              data: Buffer.from(
                "Can you summarize the release stabilization status?",
                "utf8"
              ).toString("base64url")
            }
          }
        }
      ]
    });
  }
  if (method === "POST" && path.endsWith("/drafts")) {
    return jsonResponse({
      id: "mock-draft-1",
      message: { id: "mock-draft-message-1", threadId: gmailMockThreadId }
    });
  }
  if (method === "PUT" && path.includes("/drafts/")) {
    return jsonResponse({
      id: path.split("/").at(-1) ?? "mock-draft-1",
      message: { id: "mock-draft-message-1", threadId: gmailMockThreadId }
    });
  }
  return jsonResponse({ error: "Unsupported Gmail mock request." }, 404);
}

function requestUrl(input: string | URL | Request): string {
  if (typeof input === "string") {
    return input;
  }
  return input instanceof URL ? input.toString() : input.url;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status
  });
}

export class AgentRunProcessor {
  private readonly deps: AgentRunProcessorDependencies;
  private readonly runner: AgentStepRunner;
  private readonly graph: ReturnType<typeof createAgentRunGraph>;

  public constructor(deps: AgentRunProcessorDependencies) {
    this.deps = deps;
    this.runner = new AgentStepRunner(deps);
    this.graph = createAgentRunGraph(this.runner);
  }

  public async process(job: AgentRunJob): Promise<void> {
    const context = toContext(job);
    const startedAt = performance.now();

    try {
      const graph = await this.graphForRun(context, job.runId);
      await graph.invoke(
        initialGraphState({
          context,
          runId: job.runId
        })
      );
    } catch (error) {
      await this.runner.handleError(context, job.runId, error, startedAt);
      throw error;
    }
  }

  private async graphForRun(
    context: TenantContext,
    runId: string
  ): Promise<ReturnType<typeof createAgentRunGraph>> {
    const run = await this.deps.runs.findById(context, runId);
    if (!run) {
      return this.graph;
    }
    const config = agentRunConfigSnapshotSchema.parse(run.configSnapshot);
    if (!config.workflowDefinition) {
      return this.graph;
    }
    return compileAgentWorkflowDefinition(
      config.workflowDefinition,
      this.runner
    ) as ReturnType<typeof createAgentRunGraph>;
  }
}

function toContext(job: AgentRunJob): TenantContext {
  return {
    tenantId: job.tenantId,
    userId: job.userId,
    correlationId: job.correlationId
  };
}

export type { AgentRunConfigSnapshot, CreateAgentRun, AgentRunGraphStateValue };
