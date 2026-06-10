import type {
  AgentRunConfigSnapshot,
  AgentRunJob,
  AgentRunStatus,
  CreateAgentRun,
  KnowledgeSearchResponse,
  NewsFetchRssOutput
} from "@devhub/contracts";
import {
  agentRunConfigSnapshotSchema,
  createAgentRunSchema
} from "@devhub/contracts";
import type {
  EmbeddingProviderPort,
  LlmMessage,
  LlmProviderPort,
  LlmStreamEvent
} from "@devhub/ai";
import {
  PrismaAgentRunRepository,
  PrismaDocumentRepository,
  type DatabaseClient
} from "@devhub/database";
import type { TenantContext } from "@devhub/domain";
import {
  createKnowledgeSearchTool,
  createNewsFetchRssTool,
  preview,
  StaticToolRegistry,
  ToolRegistryError,
  type ToolRegistryPort
} from "@devhub/mcp";
import type { VectorStorePort } from "@devhub/rag";
import {
  NoopRealtimeEventPublisher,
  runEventBase,
  toStepEventPayload,
  type RealtimeEventPublisher
} from "./realtime-event-publisher.js";

export interface AgentRunProcessorOptions {
  database: DatabaseClient;
  embeddingModel: string;
  embeddingProvider: EmbeddingProviderPort;
  embeddingTimeoutMs: number;
  llmProvider: LlmProviderPort;
  publisher?: RealtimeEventPublisher;
  retryCount?: number;
  vectorStore: VectorStorePort;
  rssTimeoutMs: number;
}

export async function processAgentRun(
  options: AgentRunProcessorOptions & { input: AgentRunJob }
): Promise<void> {
  const documents = new PrismaDocumentRepository(options.database);
  const runs = new PrismaAgentRunRepository(options.database);
  const tools = new StaticToolRegistry([
    createKnowledgeSearchTool({
      documents,
      embeddingModel: options.embeddingModel,
      embeddingProvider: options.embeddingProvider,
      embeddingTimeoutMs: options.embeddingTimeoutMs,
      vectorStore: options.vectorStore
    }),
    createNewsFetchRssTool({ timeoutMs: options.rssTimeoutMs })
  ]);
  const processor = new AgentRunProcessor({
    llmProvider: options.llmProvider,
    ...(options.publisher ? { publisher: options.publisher } : {}),
    retryCount: options.retryCount ?? 0,
    runs,
    tools
  });
  await processor.process(options.input);
}

export interface AgentRunProcessorDependencies {
  llmProvider: LlmProviderPort;
  publisher?: RealtimeEventPublisher;
  retryCount?: number;
  runs: Pick<
    PrismaAgentRunRepository,
    | "completeStep"
    | "failStep"
    | "findById"
    | "isCancellationRequested"
    | "markCancelled"
    | "markCompleted"
    | "markFailed"
    | "markRunning"
    | "markTimedOut"
    | "skipStep"
    | "startStep"
  >;
  tools: ToolRegistryPort;
}

interface StepExecutionResult {
  budgetExceeded?: { code: string; message: string };
  outputPreview: string;
  skipped?: boolean;
  usage?: {
    provider: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
  };
}

interface ExecutionState {
  tokens: number;
  toolCalls: number;
}

export class AgentRunProcessor {
  public constructor(private readonly deps: AgentRunProcessorDependencies) {}

  public async process(job: AgentRunJob): Promise<void> {
    const context = toContext(job);
    const run = await this.deps.runs.markRunning(context, job.runId);
    if (!run) {
      return;
    }

    const input = createAgentRunSchema.parse(run.input);
    const config = agentRunConfigSnapshotSchema.parse(run.configSnapshot);
    const startedAt = performance.now();
    const signal = AbortSignal.timeout(config.timeoutMs);

    try {
      const outputs: string[] = [];
      const state: ExecutionState = { tokens: 0, toolCalls: 0 };
      await this.publish(context, {
        ...runEventBase(context),
        type: "agent_run.started",
        payload: { runId: job.runId, status: "RUNNING" }
      });
      outputs.push(
        await this.runRetrievalStep(context, job.runId, input, config, state)
      );
      outputs.push(
        await this.runNewsStep(context, job.runId, input, config, state)
      );
      await this.runLlmStep(
        context,
        job.runId,
        input,
        config,
        outputs,
        signal,
        state
      );
      await this.deps.runs.markCompleted(context, job.runId);
      await this.publishStatus(context, job.runId, "COMPLETED");
    } catch (error) {
      await this.handleError(context, job.runId, error, startedAt);
      throw error;
    }
  }

  private async runRetrievalStep(
    context: TenantContext,
    runId: string,
    input: CreateAgentRun,
    config: AgentRunConfigSnapshot,
    state: ExecutionState
  ): Promise<string> {
    if (!config.enabledToolIds.includes("knowledge.search")) {
      return this.runStep(
        context,
        runId,
        1,
        "rag.retrieve",
        input.message,
        config,
        () =>
          Promise.resolve({
            outputPreview: "knowledge.search is not enabled for this agent.",
            skipped: true
          })
      );
    }
    return this.runStep(
      context,
      runId,
      1,
      "rag.retrieve",
      input.message,
      config,
      () =>
        this.runTool<KnowledgeSearchResponse>(
          context,
          config,
          state,
          "knowledge.search",
          {
            query: input.message,
            limit: input.retrievalLimit,
            ...(input.documentIds ? { documentIds: input.documentIds } : {})
          }
        )
    );
  }

  private async runNewsStep(
    context: TenantContext,
    runId: string,
    input: CreateAgentRun,
    config: AgentRunConfigSnapshot,
    state: ExecutionState
  ): Promise<string> {
    if (!input.rssUrl) {
      return this.runStep(
        context,
        runId,
        2,
        "mcp.news",
        "no rssUrl",
        config,
        () =>
          Promise.resolve({
            outputPreview: "No RSS URL requested.",
            skipped: true
          })
      );
    }

    return this.runStep(
      context,
      runId,
      2,
      "mcp.news",
      input.rssUrl,
      config,
      () =>
        this.runTool<NewsFetchRssOutput>(
          context,
          config,
          state,
          "news.fetch_rss",
          {
            url: input.rssUrl,
            limit: 5
          }
        )
    );
  }

  private async runLlmStep(
    context: TenantContext,
    runId: string,
    input: CreateAgentRun,
    config: AgentRunConfigSnapshot,
    contextOutputs: readonly string[],
    signal: AbortSignal,
    state: ExecutionState
  ): Promise<string> {
    return this.runStep(
      context,
      runId,
      3,
      "llm.generate",
      input.message,
      config,
      (stepId) =>
        this.generateAnswer(
          context,
          runId,
          stepId,
          input,
          config,
          contextOutputs,
          signal,
          state
        )
    );
  }

  private async runTool<TOutput>(
    context: TenantContext,
    config: AgentRunConfigSnapshot,
    state: ExecutionState,
    toolId: "knowledge.search" | "news.fetch_rss",
    input: unknown
  ): Promise<StepExecutionResult> {
    if (state.toolCalls >= config.maxToolCalls) {
      throw new Error("Agent run exceeded its maximum tool call budget.");
    }
    state.toolCalls += 1;
    const result = await this.deps.tools.call<TOutput>({
      agent: { id: config.agentId, enabledToolIds: config.enabledToolIds },
      context,
      toolId,
      input
    });
    return { outputPreview: result.outputPreview };
  }

  private async generateAnswer(
    context: TenantContext,
    runId: string,
    stepId: string,
    input: CreateAgentRun,
    config: AgentRunConfigSnapshot,
    contextOutputs: readonly string[],
    signal: AbortSignal,
    state: ExecutionState
  ): Promise<StepExecutionResult> {
    this.assertTokenBudget(config, state.tokens);
    const messages: readonly LlmMessage[] = [
      { role: "system", content: config.systemPrompt },
      {
        role: "user",
        content: [
          input.message,
          "",
          "Untrusted tool and retrieval context:",
          ...contextOutputs.filter(Boolean)
        ].join("\n")
      }
    ];
    let content = "";
    let completed: Extract<LlmStreamEvent, { type: "completed" }> | undefined;

    for await (const event of this.deps.llmProvider.streamChat({
      model: config.model,
      messages,
      timeoutMs: config.timeoutMs,
      signal,
      ...(config.maxTokens ? { maxTokens: config.maxTokens } : {})
    })) {
      if (event.type === "delta") {
        content += event.text;
        await this.publish(context, {
          ...runEventBase(context),
          type: "agent_run.token_delta",
          payload: {
            runId,
            stepId,
            text: event.text
          }
        });
      } else {
        completed = event;
      }
    }
    if (!completed) {
      throw new Error("The model stream ended without completion metadata.");
    }
    const usedTokens =
      completed.usage.inputTokens + completed.usage.outputTokens;
    state.tokens += usedTokens;

    return {
      ...(config.maxTokens !== null && state.tokens > config.maxTokens
        ? {
            budgetExceeded: {
              code: "TOKEN_BUDGET_EXCEEDED",
              message: `Agent run used ${state.tokens} tokens, exceeding the ${config.maxTokens} token budget.`
            }
          }
        : {}),
      outputPreview: preview({ content }),
      usage: {
        provider: this.deps.llmProvider.name,
        model: config.model,
        inputTokens: completed.usage.inputTokens,
        outputTokens: completed.usage.outputTokens
      }
    };
  }

  private async runStep(
    context: TenantContext,
    runId: string,
    sequence: number,
    kind: string,
    inputPreview: string,
    config: AgentRunConfigSnapshot,
    execute: (stepId: string) => Promise<StepExecutionResult>
  ): Promise<string> {
    if (sequence > config.maxSteps) {
      throw new Error("Agent run exceeded its maximum step budget.");
    }
    await this.throwIfCancelled(context, runId);
    const step = await this.deps.runs.startStep(
      context,
      runId,
      sequence,
      kind,
      inputPreview
    );
    if (step.status === "COMPLETED" || step.status === "SKIPPED") {
      return step.outputPreview ?? "";
    }
    await this.publish(context, {
      ...runEventBase(context),
      type: "agent_run.step_changed",
      payload: toStepEventPayload(step)
    });

    const startedAt = performance.now();
    try {
      const result = await execute(step.id);
      const durationMs = Math.round(performance.now() - startedAt);
      let updatedStep;
      if (result.skipped) {
        updatedStep = await this.deps.runs.skipStep(
          context,
          step.id,
          result.outputPreview,
          durationMs
        );
      } else {
        updatedStep = await this.deps.runs.completeStep(context, step.id, {
          outputPreview: result.outputPreview,
          durationMs,
          retryCount: this.deps.retryCount ?? 0,
          ...(result.usage ?? {})
        });
      }
      await this.publish(context, {
        ...runEventBase(context),
        type: "agent_run.step_changed",
        payload: toStepEventPayload(updatedStep)
      });
      if (result.budgetExceeded) {
        throw new BudgetExceededError(
          result.budgetExceeded.code,
          result.budgetExceeded.message
        );
      }
      return result.outputPreview;
    } catch (error) {
      const durationMs = Math.round(performance.now() - startedAt);
      const failedStep = await this.deps.runs.failStep(
        context,
        step.id,
        errorCode(error),
        errorMessage(error),
        durationMs
      );
      await this.publish(context, {
        ...runEventBase(context),
        type: "agent_run.step_changed",
        payload: toStepEventPayload(failedStep)
      });
      throw error;
    }
  }

  private async throwIfCancelled(
    context: TenantContext,
    runId: string
  ): Promise<void> {
    if (await this.deps.runs.isCancellationRequested(context, runId)) {
      throw new RunCancelledError();
    }
  }

  private assertTokenBudget(
    config: AgentRunConfigSnapshot,
    tokens: number
  ): void {
    if (config.maxTokens !== null && tokens > config.maxTokens) {
      throw new BudgetExceededError(
        "TOKEN_BUDGET_EXCEEDED",
        `Agent run used ${tokens} tokens, exceeding the ${config.maxTokens} token budget.`
      );
    }
  }

  private async handleError(
    context: TenantContext,
    runId: string,
    error: unknown,
    startedAt: number
  ): Promise<void> {
    if (error instanceof RunCancelledError) {
      await this.deps.runs.markCancelled(context, runId);
      await this.publishStatus(context, runId, "CANCELLED", "RUN_CANCELLED");
      return;
    }
    if (error instanceof BudgetExceededError) {
      await this.deps.runs.markFailed(
        context,
        runId,
        error.code,
        error.message
      );
      await this.publishStatus(
        context,
        runId,
        "FAILED",
        error.code,
        error.message
      );
      return;
    }
    if (isTimeout(error)) {
      await this.deps.runs.markTimedOut(
        context,
        runId,
        `Agent run exceeded its timeout after ${Math.round(
          performance.now() - startedAt
        )}ms.`
      );
      await this.publishStatus(context, runId, "TIMED_OUT", "RUN_TIMED_OUT");
      return;
    }
    await this.deps.runs.markFailed(
      context,
      runId,
      errorCode(error),
      errorMessage(error)
    );
    await this.publishStatus(
      context,
      runId,
      "FAILED",
      errorCode(error),
      errorMessage(error)
    );
  }

  private async publishStatus(
    context: TenantContext,
    runId: string,
    status: AgentRunStatus,
    errorCode?: string,
    errorMessage?: string
  ): Promise<void> {
    await this.publish(context, {
      ...runEventBase(context),
      type: "agent_run.status_changed",
      payload: {
        runId,
        status,
        ...(errorCode ? { errorCode } : {}),
        ...(errorMessage ? { errorMessage } : {})
      }
    });
  }

  private publish(
    _context: TenantContext,
    event: Parameters<RealtimeEventPublisher["publish"]>[0]
  ): Promise<void> {
    return (this.deps.publisher ?? new NoopRealtimeEventPublisher()).publish(
      event
    );
  }
}

class RunCancelledError extends Error {
  public constructor() {
    super("Agent run was cancelled.");
    this.name = "RunCancelledError";
  }
}

class BudgetExceededError extends Error {
  public constructor(
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "BudgetExceededError";
  }
}

function toContext(job: AgentRunJob): TenantContext {
  return {
    tenantId: job.tenantId,
    userId: job.userId,
    correlationId: job.correlationId
  };
}

function errorCode(error: unknown): string {
  if (error instanceof ToolRegistryError) {
    return error.code;
  }
  if (isTimeout(error)) {
    return "RUN_TIMED_OUT";
  }
  return "AGENT_RUN_FAILED";
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Unknown agent runtime error.";
}

function isTimeout(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "TimeoutError") ||
    (error instanceof Error && error.name === "TimeoutError")
  );
}
