import type {
  CreateGoldenCase,
  EvaluationMode,
  EvaluationReport,
  EvaluationResult,
  EvaluationResultDetails,
  EvaluationRun,
  GoldenCase,
  UpdateGoldenCase
} from "@devhub/contracts";
import type { TenantContext } from "@devhub/domain";

import type { AgentDefinitionRecord } from "./agent-definition-repository.js";
import type { DatabaseClient } from "./client.js";
import type { Prisma } from "./generated/prisma/client.js";

export interface GoldenCaseRecord {
  id: string;
  tenantId: string;
  agentId: string;
  name: string;
  input: string;
  expectedFacts: readonly string[];
  forbiddenClaims: readonly string[];
  expectedSources: readonly string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface GoldenCaseWithAgentRecord extends GoldenCaseRecord {
  agent: AgentDefinitionRecord;
}

export interface EvaluationRunRecord {
  id: string;
  tenantId: string;
  status: EvaluationRun["status"];
  mode: EvaluationMode;
  configVersion: string;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface EvaluationResultRecord {
  id: string;
  tenantId: string;
  evaluationRunId: string;
  goldenCaseId: string;
  mode: EvaluationMode;
  agentRunId: string | null;
  passed: boolean;
  score: number;
  details: unknown;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  retrievalHit: boolean;
  toolCallsUsed: number;
  terminalStatus: string | null;
  errorCode: string | null;
  errorMessagePreview: string | null;
  workflowVersion: string | null;
  createdAt: Date;
}

export interface CreateEvaluationResultInput {
  goldenCaseId: string;
  mode?: EvaluationMode;
  agentRunId?: string | null;
  passed: boolean;
  score: number;
  details: EvaluationResultDetails;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  retrievalHit: boolean;
  toolCallsUsed?: number;
  terminalStatus?: string | null;
  errorCode?: string | null;
  errorMessagePreview?: string | null;
  workflowVersion?: string | null;
}

export class PrismaGoldenEvaluationRepository {
  public constructor(private readonly database: DatabaseClient) {}

  public async listCases(
    context: TenantContext
  ): Promise<readonly GoldenCaseRecord[]> {
    return this.database.goldenCase.findMany({
      where: { tenantId: context.tenantId, deletedAt: null },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }]
    });
  }

  public async findCaseById(
    context: TenantContext,
    caseId: string
  ): Promise<GoldenCaseRecord | null> {
    return this.database.goldenCase.findFirst({
      where: { id: caseId, tenantId: context.tenantId, deletedAt: null }
    });
  }

  public async createCase(
    context: TenantContext,
    input: CreateGoldenCase
  ): Promise<GoldenCaseRecord> {
    return this.database.goldenCase.create({
      data: {
        tenantId: context.tenantId,
        agentId: input.agentId,
        name: input.name,
        input: input.input,
        expectedFacts: [...input.expectedFacts],
        forbiddenClaims: [...input.forbiddenClaims],
        expectedSources: [...input.expectedSources]
      }
    });
  }

  public async updateCase(
    context: TenantContext,
    caseId: string,
    input: UpdateGoldenCase
  ): Promise<GoldenCaseRecord | null> {
    const updated = await this.database.goldenCase.updateManyAndReturn({
      where: { id: caseId, tenantId: context.tenantId, deletedAt: null },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.input !== undefined ? { input: input.input } : {}),
        ...(input.expectedFacts !== undefined
          ? { expectedFacts: [...input.expectedFacts] }
          : {}),
        ...(input.forbiddenClaims !== undefined
          ? { forbiddenClaims: [...input.forbiddenClaims] }
          : {}),
        ...(input.expectedSources !== undefined
          ? { expectedSources: [...input.expectedSources] }
          : {})
      }
    });
    return updated[0] ?? null;
  }

  public async deleteCase(
    context: TenantContext,
    caseId: string
  ): Promise<boolean> {
    const result = await this.database.goldenCase.updateMany({
      where: { id: caseId, tenantId: context.tenantId, deletedAt: null },
      data: { deletedAt: new Date() }
    });
    return result.count === 1;
  }

  public async listCasesForEvaluation(
    context: TenantContext
  ): Promise<readonly GoldenCaseWithAgentRecord[]> {
    return this.database.goldenCase.findMany({
      where: { tenantId: context.tenantId, deletedAt: null },
      include: { agent: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }]
    });
  }

  public async createEvaluationRun(
    context: TenantContext,
    configVersion: string,
    mode: EvaluationMode = "FAST_LLM_ONLY"
  ): Promise<EvaluationRunRecord> {
    return this.database.evaluationRun.create({
      data: {
        tenantId: context.tenantId,
        status: "QUEUED",
        mode,
        configVersion
      }
    });
  }

  public async listEvaluationRuns(
    context: TenantContext
  ): Promise<readonly EvaluationRunRecord[]> {
    return this.database.evaluationRun.findMany({
      where: { tenantId: context.tenantId },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      take: 100
    });
  }

  public async findEvaluationRun(
    context: TenantContext,
    evaluationRunId: string
  ): Promise<EvaluationRunRecord | null> {
    return this.database.evaluationRun.findFirst({
      where: { id: evaluationRunId, tenantId: context.tenantId }
    });
  }

  public async listEvaluationResults(
    context: TenantContext,
    evaluationRunId: string
  ): Promise<readonly EvaluationResultRecord[] | null> {
    const run = await this.findEvaluationRun(context, evaluationRunId);
    if (!run) {
      return null;
    }
    return this.database.evaluationResult.findMany({
      where: { tenantId: context.tenantId, evaluationRunId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }]
    });
  }

  public async markEvaluationRunning(
    context: TenantContext,
    evaluationRunId: string
  ): Promise<EvaluationRunRecord | null> {
    const updated = await this.database.evaluationRun.updateManyAndReturn({
      where: {
        id: evaluationRunId,
        tenantId: context.tenantId,
        status: { in: ["QUEUED", "RUNNING"] }
      },
      data: { status: "RUNNING", startedAt: new Date() }
    });
    return updated[0] ?? null;
  }

  public async markEvaluationCompleted(
    context: TenantContext,
    evaluationRunId: string
  ): Promise<EvaluationRunRecord | null> {
    return this.finishEvaluation(context, evaluationRunId, "COMPLETED");
  }

  public async markEvaluationFailed(
    context: TenantContext,
    evaluationRunId: string
  ): Promise<EvaluationRunRecord | null> {
    return this.finishEvaluation(context, evaluationRunId, "FAILED");
  }

  public async createEvaluationResult(
    context: TenantContext,
    evaluationRunId: string,
    input: CreateEvaluationResultInput
  ): Promise<EvaluationResultRecord> {
    return this.database.evaluationResult.upsert({
      where: {
        tenantId_evaluationRunId_goldenCaseId: {
          tenantId: context.tenantId,
          evaluationRunId,
          goldenCaseId: input.goldenCaseId
        }
      },
      update: resultData(input),
      create: {
        tenantId: context.tenantId,
        evaluationRunId,
        ...resultData(input)
      }
    });
  }

  public toCaseResponse(record: GoldenCaseRecord): GoldenCase {
    return {
      id: record.id,
      agentId: record.agentId,
      name: record.name,
      input: record.input,
      expectedFacts: [...record.expectedFacts],
      forbiddenClaims: [...record.forbiddenClaims],
      expectedSources: [...record.expectedSources],
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString()
    };
  }

  public toEvaluationRunResponse(record: EvaluationRunRecord): EvaluationRun {
    return {
      id: record.id,
      status: record.status,
      mode: record.mode,
      configVersion: record.configVersion,
      startedAt: record.startedAt?.toISOString() ?? null,
      completedAt: record.completedAt?.toISOString() ?? null,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString()
    };
  }

  public toResultResponse(record: EvaluationResultRecord): EvaluationResult {
    return {
      id: record.id,
      evaluationRunId: record.evaluationRunId,
      goldenCaseId: record.goldenCaseId,
      mode: record.mode,
      agentRunId: record.agentRunId,
      passed: record.passed,
      score: record.score,
      details: record.details as EvaluationResultDetails,
      latencyMs: record.latencyMs,
      inputTokens: record.inputTokens,
      outputTokens: record.outputTokens,
      retrievalHit: record.retrievalHit,
      toolCallsUsed: record.toolCallsUsed,
      terminalStatus: record.terminalStatus,
      errorCode: record.errorCode,
      errorMessagePreview: record.errorMessagePreview,
      workflowVersion: record.workflowVersion,
      createdAt: record.createdAt.toISOString()
    };
  }

  public toReportResponse(
    run: EvaluationRunRecord,
    results: readonly EvaluationResultRecord[]
  ): EvaluationReport {
    return {
      run: this.toEvaluationRunResponse(run),
      results: results.map((result) => this.toResultResponse(result))
    };
  }

  private async finishEvaluation(
    context: TenantContext,
    evaluationRunId: string,
    status: EvaluationRun["status"]
  ): Promise<EvaluationRunRecord | null> {
    const updated = await this.database.evaluationRun.updateManyAndReturn({
      where: { id: evaluationRunId, tenantId: context.tenantId },
      data: { status, completedAt: new Date() }
    });
    return updated[0] ?? null;
  }
}

function resultData(input: CreateEvaluationResultInput): {
  goldenCaseId: string;
  mode: EvaluationMode;
  agentRunId: string | null;
  passed: boolean;
  score: number;
  details: Prisma.InputJsonValue;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  retrievalHit: boolean;
  toolCallsUsed: number;
  terminalStatus: string | null;
  errorCode: string | null;
  errorMessagePreview: string | null;
  workflowVersion: string | null;
} {
  return {
    goldenCaseId: input.goldenCaseId,
    mode: input.mode ?? "FAST_LLM_ONLY",
    agentRunId: input.agentRunId ?? null,
    passed: input.passed,
    score: input.score,
    details: input.details as Prisma.InputJsonValue,
    latencyMs: input.latencyMs,
    inputTokens: input.inputTokens,
    outputTokens: input.outputTokens,
    retrievalHit: input.retrievalHit,
    toolCallsUsed: input.toolCallsUsed ?? 0,
    terminalStatus: input.terminalStatus ?? null,
    errorCode: input.errorCode ?? null,
    errorMessagePreview: input.errorMessagePreview ?? null,
    workflowVersion: input.workflowVersion ?? null
  };
}
