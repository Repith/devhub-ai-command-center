import type {
  AgentRunJob,
  CreateAgentRun,
  EvaluationMode,
  GoldenEvaluationJob,
  EvaluationResultDetails
} from "@devhub/contracts";
import { goldenEvaluationJobSchema } from "@devhub/contracts";
import type { LlmMessage, LlmProviderPort, LlmStreamEvent } from "@devhub/ai";
import {
  PrismaAgentRunRepository,
  PrismaConversationRepository,
  PrismaGoldenEvaluationRepository,
  type DatabaseClient,
  type AgentRunRecord,
  type AgentRunStepRecord,
  type ConversationMessageRecord,
  type GoldenCaseWithAgentRecord
} from "@devhub/database";
import type { TenantContext } from "@devhub/domain";

import {
  processAgentRun,
  type AgentRunProcessorOptions
} from "./agent-run-processor.js";

export interface GoldenEvaluationProcessorOptions {
  database: DatabaseClient;
  input: GoldenEvaluationJob;
  llmProvider: LlmProviderPort;
  runtime?: Omit<
    AgentRunProcessorOptions,
    "database" | "input" | "llmProvider"
  >;
  timeoutMs: number;
}

export async function processGoldenEvaluation(
  options: GoldenEvaluationProcessorOptions
): Promise<void> {
  const evaluations = new PrismaGoldenEvaluationRepository(options.database);
  const conversations = new PrismaConversationRepository(options.database);
  const runs = new PrismaAgentRunRepository(options.database);
  const processor = new GoldenEvaluationProcessor({
    evaluations,
    llmProvider: options.llmProvider,
    ...(options.runtime
      ? {
          runtime: {
            conversations,
            runAgent: (input) =>
              processAgentRun({
                ...options.runtime!,
                database: options.database,
                input,
                llmProvider: options.llmProvider
              }),
            runs
          }
        }
      : {}),
    timeoutMs: options.timeoutMs
  });
  await processor.process(options.input);
}

export interface GoldenEvaluationProcessorDependencies {
  evaluations: Pick<
    PrismaGoldenEvaluationRepository,
    | "createEvaluationResult"
    | "listCasesForEvaluation"
    | "markEvaluationCompleted"
    | "markEvaluationFailed"
    | "markEvaluationRunning"
  >;
  llmProvider: LlmProviderPort;
  runtime?: {
    conversations: Pick<PrismaConversationRepository, "listMessages">;
    runAgent: (input: AgentRunJob) => Promise<void>;
    runs: Pick<
      PrismaAgentRunRepository,
      "createQueuedWithUserMessage" | "findById" | "listSteps"
    >;
  };
  timeoutMs: number;
}

export class GoldenEvaluationProcessor {
  public constructor(
    private readonly deps: GoldenEvaluationProcessorDependencies
  ) {}

  public async process(input: GoldenEvaluationJob): Promise<void> {
    const job = goldenEvaluationJobSchema.parse(input);
    const context = toContext(job);
    const run = await this.deps.evaluations.markEvaluationRunning(
      context,
      job.evaluationRunId
    );
    if (!run) {
      return;
    }

    try {
      const cases = await this.deps.evaluations.listCasesForEvaluation(context);
      for (const goldenCase of cases) {
        await this.evaluateCase(
          context,
          job.evaluationRunId,
          job.mode,
          goldenCase
        );
      }
      await this.deps.evaluations.markEvaluationCompleted(
        context,
        job.evaluationRunId
      );
    } catch (error) {
      await this.deps.evaluations.markEvaluationFailed(
        context,
        job.evaluationRunId
      );
      throw error;
    }
  }

  private async evaluateCase(
    context: TenantContext,
    evaluationRunId: string,
    mode: EvaluationMode,
    goldenCase: GoldenCaseWithAgentRecord
  ): Promise<void> {
    const startedAt = performance.now();
    const response =
      mode === "FULL_AGENT_RUNTIME"
        ? await this.runFullAgentRuntime(context, goldenCase)
        : await this.generateAnswer(goldenCase);
    const evaluation = evaluateAnswer(goldenCase, response.content);

    await this.deps.evaluations.createEvaluationResult(
      context,
      evaluationRunId,
      {
        goldenCaseId: goldenCase.id,
        mode,
        agentRunId: response.agentRun?.id ?? null,
        passed: evaluation.passed,
        score: evaluation.score,
        details: evaluation.details,
        latencyMs: Math.round(performance.now() - startedAt),
        inputTokens: response.inputTokens,
        outputTokens: response.outputTokens,
        retrievalHit: evaluation.retrievalHit,
        toolCallsUsed: response.toolCallsUsed,
        terminalStatus: response.agentRun?.status ?? null,
        errorCode: response.agentRun?.errorCode ?? null,
        errorMessagePreview: response.agentRun?.errorMessage
          ? preview(response.agentRun.errorMessage)
          : null,
        workflowVersion: response.workflowVersion
      }
    );
  }

  private async generateAnswer(
    goldenCase: GoldenCaseWithAgentRecord
  ): Promise<EvaluationCaseResponse> {
    const messages: readonly LlmMessage[] = [
      { role: "system", content: goldenCase.agent.systemPrompt },
      {
        role: "user",
        content: [
          goldenCase.input,
          "",
          "Evaluation instruction:",
          "Answer normally. If you use sources, include their stable names or URLs."
        ].join("\n")
      }
    ];
    const signal = AbortSignal.timeout(this.deps.timeoutMs);
    let content = "";
    let completed: Extract<LlmStreamEvent, { type: "completed" }> | undefined;

    for await (const event of this.deps.llmProvider.streamChat({
      model: goldenCase.agent.model,
      messages,
      timeoutMs: this.deps.timeoutMs,
      signal,
      ...(goldenCase.agent.maxTokens
        ? { maxTokens: goldenCase.agent.maxTokens }
        : {})
    })) {
      if (event.type === "delta") {
        content += event.text;
      } else {
        completed = event;
      }
    }
    if (!completed) {
      throw new Error("The model stream ended without completion metadata.");
    }
    return {
      content,
      inputTokens: completed.usage.inputTokens,
      outputTokens: completed.usage.outputTokens,
      toolCallsUsed: 0,
      workflowVersion: "fast-llm-only:v1"
    };
  }

  private async runFullAgentRuntime(
    context: TenantContext,
    goldenCase: GoldenCaseWithAgentRecord
  ): Promise<EvaluationCaseResponse> {
    if (!this.deps.runtime) {
      throw new Error("Full agent runtime evaluation is not configured.");
    }
    const input: CreateAgentRun = {
      message: goldenCase.input,
      retrievalLimit: 5
    };
    const run = await this.deps.runtime.runs.createQueuedWithUserMessage(
      context,
      goldenCase.agent,
      input
    );
    try {
      await this.deps.runtime.runAgent({
        version: 1,
        tenantId: context.tenantId,
        userId: context.userId,
        correlationId: `${context.correlationId}:golden:${goldenCase.id}`,
        runId: run.id
      });
    } catch {
      // The agent processor has already persisted the terminal failure state.
    }
    const finalRun = await this.deps.runtime.runs.findById(context, run.id);
    const steps =
      (await this.deps.runtime.runs.listSteps(context, run.id)) ?? [];
    const conversationId = finalRun?.conversationId ?? run.conversationId;
    const messages = conversationId
      ? await this.deps.runtime.conversations.listMessages(
          context,
          conversationId
        )
      : null;
    const assistant = latestAssistantMessage(messages ?? []);

    return {
      agentRun: finalRun ?? run,
      content: assistant?.content ?? runtimeFallbackAnswer(finalRun, steps),
      inputTokens: assistant?.inputTokens ?? 0,
      outputTokens: assistant?.outputTokens ?? 0,
      toolCallsUsed: countRuntimeToolCalls(steps),
      workflowVersion: workflowVersion(goldenCase)
    };
  }
}

interface EvaluationCaseResponse {
  agentRun?: AgentRunRecord;
  content: string;
  inputTokens: number;
  outputTokens: number;
  toolCallsUsed: number;
  workflowVersion: string;
}

export function evaluateAnswer(
  goldenCase: Pick<
    GoldenCaseWithAgentRecord,
    "expectedFacts" | "expectedSources" | "forbiddenClaims"
  >,
  answer: string
): {
  passed: boolean;
  score: number;
  details: EvaluationResultDetails;
  retrievalHit: boolean;
} {
  const normalizedAnswer = normalize(answer);
  const expectedFacts = goldenCase.expectedFacts.map((value) =>
    matchExpectation(value, normalizedAnswer)
  );
  const forbiddenClaims = goldenCase.forbiddenClaims.map((value) =>
    matchExpectation(value, normalizedAnswer)
  );
  const expectedSources = goldenCase.expectedSources.map((value) =>
    matchExpectation(value, normalizedAnswer)
  );
  const factPasses = expectedFacts.filter((item) => item.matched).length;
  const forbiddenPasses = forbiddenClaims.filter(
    (item) => !item.matched
  ).length;
  const sourcePasses = expectedSources.filter((item) => item.matched).length;
  const total =
    expectedFacts.length + forbiddenClaims.length + expectedSources.length;
  const satisfied = factPasses + forbiddenPasses + sourcePasses;
  const passed = total === 0 ? true : satisfied === total;

  return {
    passed,
    score: total === 0 ? 1 : roundScore(satisfied / total),
    details: {
      answerPreview: preview(answer),
      expectedFacts,
      forbiddenClaims,
      expectedSources
    },
    retrievalHit:
      expectedSources.length > 0 && sourcePasses === expectedSources.length
  };
}

function matchExpectation(
  value: string,
  normalizedAnswer: string
): { value: string; matched: boolean } {
  return { value, matched: normalizedAnswer.includes(normalize(value)) };
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function preview(value: string): string {
  return value.length > 1000 ? `${value.slice(0, 997)}...` : value;
}

function latestAssistantMessage(
  messages: readonly ConversationMessageRecord[]
): ConversationMessageRecord | null {
  return (
    [...messages].reverse().find((message) => message.role === "ASSISTANT") ??
    null
  );
}

function runtimeFallbackAnswer(
  run: AgentRunRecord | null,
  steps: readonly AgentRunStepRecord[]
): string {
  const generation = steps.find((step) => step.kind === "llm.generate");
  if (generation?.outputPreview) {
    return generation.outputPreview;
  }
  if (run?.errorMessage) {
    return run.errorMessage;
  }
  return "";
}

function countRuntimeToolCalls(steps: readonly AgentRunStepRecord[]): number {
  return steps.filter(
    (step) =>
      step.status === "COMPLETED" &&
      [
        "rag.retrieve",
        "mcp.news",
        "mcp.gmail",
        "usage.summary",
        "gmail.draft_review"
      ].includes(step.kind)
  ).length;
}

function workflowVersion(goldenCase: GoldenCaseWithAgentRecord): string {
  return `default-langgraph:v1:${goldenCase.agent.templateKey ?? "custom"}`;
}

function roundScore(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function toContext(job: GoldenEvaluationJob): TenantContext {
  return {
    tenantId: job.tenantId,
    userId: job.userId,
    correlationId: job.correlationId
  };
}
