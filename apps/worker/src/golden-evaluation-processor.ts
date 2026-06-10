import type {
  GoldenEvaluationJob,
  EvaluationResultDetails
} from "@devhub/contracts";
import { goldenEvaluationJobSchema } from "@devhub/contracts";
import type { LlmMessage, LlmProviderPort, LlmStreamEvent } from "@devhub/ai";
import {
  PrismaGoldenEvaluationRepository,
  type DatabaseClient,
  type GoldenCaseWithAgentRecord
} from "@devhub/database";
import type { TenantContext } from "@devhub/domain";

export interface GoldenEvaluationProcessorOptions {
  database: DatabaseClient;
  input: GoldenEvaluationJob;
  llmProvider: LlmProviderPort;
  timeoutMs: number;
}

export async function processGoldenEvaluation(
  options: GoldenEvaluationProcessorOptions
): Promise<void> {
  const evaluations = new PrismaGoldenEvaluationRepository(options.database);
  const processor = new GoldenEvaluationProcessor({
    evaluations,
    llmProvider: options.llmProvider,
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
        await this.evaluateCase(context, job.evaluationRunId, goldenCase);
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
    goldenCase: GoldenCaseWithAgentRecord
  ): Promise<void> {
    const startedAt = performance.now();
    const response = await this.generateAnswer(goldenCase);
    const evaluation = evaluateAnswer(goldenCase, response.content);

    await this.deps.evaluations.createEvaluationResult(
      context,
      evaluationRunId,
      {
        goldenCaseId: goldenCase.id,
        passed: evaluation.passed,
        score: evaluation.score,
        details: evaluation.details,
        latencyMs: Math.round(performance.now() - startedAt),
        inputTokens: response.inputTokens,
        outputTokens: response.outputTokens,
        retrievalHit: evaluation.retrievalHit
      }
    );
  }

  private async generateAnswer(
    goldenCase: GoldenCaseWithAgentRecord
  ): Promise<{ content: string; inputTokens: number; outputTokens: number }> {
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
      outputTokens: completed.usage.outputTokens
    };
  }
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
