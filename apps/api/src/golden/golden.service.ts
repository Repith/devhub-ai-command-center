import { Inject, Injectable, NotFoundException } from "@nestjs/common";

import type {
  CreateGoldenCase,
  EvaluationReport,
  EvaluationRun,
  EvaluationRunList,
  GoldenCase,
  GoldenCaseList,
  StartGoldenEvaluation,
  UpdateGoldenCase
} from "@devhub/contracts";
import type {
  PrismaAgentDefinitionRepository,
  PrismaGoldenEvaluationRepository
} from "@devhub/database";
import type { TenantContext } from "@devhub/domain";

import type { RequestPrincipal } from "../auth/auth.types";
import { AGENT_DEFINITION_REPOSITORY } from "../agents/agents.tokens";
import { AuditService } from "../audit/audit.service";
import type { GoldenEvaluationQueue } from "./golden-queue.service";
import {
  GOLDEN_EVALUATION_QUEUE,
  GOLDEN_EVALUATION_REPOSITORY
} from "./golden.tokens";

@Injectable()
export class GoldenService {
  public constructor(
    @Inject(GOLDEN_EVALUATION_REPOSITORY)
    private readonly evaluations: PrismaGoldenEvaluationRepository,
    @Inject(AGENT_DEFINITION_REPOSITORY)
    private readonly agents: PrismaAgentDefinitionRepository,
    @Inject(GOLDEN_EVALUATION_QUEUE)
    private readonly queue: GoldenEvaluationQueue,
    @Inject(AuditService) private readonly audit: AuditService
  ) {}

  public async listCases(principal: RequestPrincipal): Promise<GoldenCaseList> {
    const records = await this.evaluations.listCases(this.context(principal));
    return {
      data: records.map((record) => this.evaluations.toCaseResponse(record)),
      page: { cursor: null, nextCursor: null, limit: 1000 }
    };
  }

  public async findCaseById(
    principal: RequestPrincipal,
    caseId: string
  ): Promise<GoldenCase> {
    const record = await this.evaluations.findCaseById(
      this.context(principal),
      caseId
    );
    if (!record) {
      throw new NotFoundException("Golden case was not found.");
    }
    return this.evaluations.toCaseResponse(record);
  }

  public async createCase(
    principal: RequestPrincipal,
    input: CreateGoldenCase
  ): Promise<GoldenCase> {
    const context = this.context(principal);
    await this.requireAgent(context, input.agentId);
    const record = await this.evaluations.createCase(context, input);
    await this.audit.record(principal, {
      action: "golden_case.created",
      resourceType: "golden_case",
      resourceId: record.id,
      metadata: { agentId: record.agentId }
    });
    return this.evaluations.toCaseResponse(record);
  }

  public async updateCase(
    principal: RequestPrincipal,
    caseId: string,
    input: UpdateGoldenCase
  ): Promise<GoldenCase> {
    const record = await this.evaluations.updateCase(
      this.context(principal),
      caseId,
      input
    );
    if (!record) {
      throw new NotFoundException("Golden case was not found.");
    }
    await this.audit.record(principal, {
      action: "golden_case.updated",
      resourceType: "golden_case",
      resourceId: record.id,
      metadata: { fields: Object.keys(input).sort() }
    });
    return this.evaluations.toCaseResponse(record);
  }

  public async deleteCase(
    principal: RequestPrincipal,
    caseId: string
  ): Promise<void> {
    const deleted = await this.evaluations.deleteCase(
      this.context(principal),
      caseId
    );
    if (!deleted) {
      throw new NotFoundException("Golden case was not found.");
    }
    await this.audit.record(principal, {
      action: "golden_case.deleted",
      resourceType: "golden_case",
      resourceId: caseId
    });
  }

  public async startEvaluation(
    principal: RequestPrincipal,
    input: StartGoldenEvaluation
  ): Promise<EvaluationRun> {
    const context = this.context(principal);
    const cases = await this.evaluations.listCases(context);
    const run = await this.evaluations.createEvaluationRun(
      context,
      configVersion(cases, input.mode),
      input.mode
    );
    await this.queue.enqueue({
      version: 1,
      tenantId: principal.tenantId,
      userId: principal.userId,
      correlationId: principal.sessionId,
      evaluationRunId: run.id,
      mode: input.mode
    });
    await this.audit.record(principal, {
      action: "evaluation.started",
      resourceType: "evaluation_run",
      resourceId: run.id,
      metadata: { configVersion: run.configVersion, mode: run.mode }
    });
    return this.evaluations.toEvaluationRunResponse(run);
  }

  public async listEvaluationRuns(
    principal: RequestPrincipal
  ): Promise<EvaluationRunList> {
    const records = await this.evaluations.listEvaluationRuns(
      this.context(principal)
    );
    return {
      data: records.map((record) =>
        this.evaluations.toEvaluationRunResponse(record)
      ),
      page: { cursor: null, nextCursor: null, limit: 100 }
    };
  }

  public async getEvaluationReport(
    principal: RequestPrincipal,
    evaluationRunId: string
  ): Promise<EvaluationReport> {
    const context = this.context(principal);
    const run = await this.evaluations.findEvaluationRun(
      context,
      evaluationRunId
    );
    if (!run) {
      throw new NotFoundException("Evaluation run was not found.");
    }
    const results =
      (await this.evaluations.listEvaluationResults(
        context,
        evaluationRunId
      )) ?? [];
    return this.evaluations.toReportResponse(run, results);
  }

  private async requireAgent(
    context: TenantContext,
    agentId: string
  ): Promise<void> {
    const agent = await this.agents.findById(context, agentId);
    if (!agent) {
      throw new NotFoundException("Agent definition was not found.");
    }
  }

  private context(principal: RequestPrincipal): TenantContext {
    return {
      tenantId: principal.tenantId,
      userId: principal.userId,
      correlationId: principal.sessionId
    };
  }
}

function configVersion(
  cases: readonly { updatedAt: Date }[],
  mode: StartGoldenEvaluation["mode"]
): string {
  const latest = cases.reduce<number>(
    (current, item) => Math.max(current, item.updatedAt.getTime()),
    0
  );
  return `golden-set:v1:${mode}:cases-${cases.length}:updated-${latest}`;
}
