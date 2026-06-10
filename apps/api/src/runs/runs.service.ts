import { Inject, Injectable, NotFoundException } from "@nestjs/common";

import type {
  AgentRun,
  AgentRunList,
  AgentRunSnapshot,
  AgentRunStepList,
  CreateAgentRun
} from "@devhub/contracts";
import type {
  PrismaAgentDefinitionRepository,
  PrismaAgentRunRepository
} from "@devhub/database";
import type { TenantContext } from "@devhub/domain";

import type { RequestPrincipal } from "../auth/auth.types";
import { AGENT_DEFINITION_REPOSITORY } from "../agents/agents.tokens";
import { AuditService } from "../audit/audit.service";
import type { AgentRunQueue } from "./agent-run-queue.service";
import { AGENT_RUN_QUEUE, AGENT_RUN_REPOSITORY } from "./runs.tokens";

@Injectable()
export class RunsService {
  public constructor(
    @Inject(AGENT_DEFINITION_REPOSITORY)
    private readonly agents: PrismaAgentDefinitionRepository,
    @Inject(AGENT_RUN_REPOSITORY)
    private readonly runs: PrismaAgentRunRepository,
    @Inject(AGENT_RUN_QUEUE) private readonly queue: AgentRunQueue,
    @Inject(AuditService) private readonly audit: AuditService
  ) {}

  public async start(
    principal: RequestPrincipal,
    agentId: string,
    input: CreateAgentRun
  ): Promise<AgentRun> {
    const context = this.context(principal);
    const agent = await this.agents.findById(context, agentId);
    if (!agent) {
      throw new NotFoundException("Agent definition was not found.");
    }
    const run = await this.runs.createQueued(context, agent, input);
    await this.queue.enqueue({
      version: 1,
      tenantId: context.tenantId,
      userId: context.userId,
      correlationId: run.correlationId,
      runId: run.id
    });
    await this.audit.record(principal, {
      action: "agent_run.started",
      resourceType: "agent_run",
      resourceId: run.id,
      metadata: { agentId: agent.id }
    });
    return this.runs.toRunResponse(run);
  }

  public async list(principal: RequestPrincipal): Promise<AgentRunList> {
    const data = await this.runs.list(this.context(principal));
    return {
      data: data.map((run) => this.runs.toRunResponse(run)),
      page: { cursor: null, nextCursor: null, limit: 100 }
    };
  }

  public async get(
    principal: RequestPrincipal,
    runId: string
  ): Promise<AgentRunSnapshot> {
    const context = this.context(principal);
    const [run, steps] = await Promise.all([
      this.runs.findById(context, runId),
      this.runs.listSteps(context, runId)
    ]);
    if (!run || !steps) {
      throw new NotFoundException("Agent run was not found.");
    }
    return {
      run: this.runs.toRunResponse(run),
      steps: steps.map((step) => this.runs.toStepResponse(step))
    };
  }

  public async listSteps(
    principal: RequestPrincipal,
    runId: string
  ): Promise<AgentRunStepList> {
    const steps = await this.runs.listSteps(this.context(principal), runId);
    if (!steps) {
      throw new NotFoundException("Agent run was not found.");
    }
    return {
      data: steps.map((step) => this.runs.toStepResponse(step)),
      page: { cursor: null, nextCursor: null, limit: 1000 }
    };
  }

  public async cancel(
    principal: RequestPrincipal,
    runId: string
  ): Promise<AgentRun> {
    const run = await this.runs.requestCancellation(
      this.context(principal),
      runId
    );
    if (!run) {
      throw new NotFoundException("Running agent run was not found.");
    }
    await this.audit.record(principal, {
      action: "agent_run.cancel_requested",
      resourceType: "agent_run",
      resourceId: run.id
    });
    return this.runs.toRunResponse(run);
  }

  private context(principal: RequestPrincipal): TenantContext {
    return {
      tenantId: principal.tenantId,
      userId: principal.userId,
      correlationId: principal.sessionId
    };
  }
}
