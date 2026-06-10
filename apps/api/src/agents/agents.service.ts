import { Inject, Injectable, NotFoundException } from "@nestjs/common";

import type {
  AgentDefinition,
  CreateAgentDefinition,
  UpdateAgentDefinition
} from "@devhub/contracts";
import type {
  AgentDefinitionRecord,
  PrismaAgentDefinitionRepository
} from "@devhub/database";
import type { TenantContext } from "@devhub/domain";

import type { RequestPrincipal } from "../auth/auth.types";
import { AuditService } from "../audit/audit.service";
import { AGENT_DEFINITION_REPOSITORY } from "./agents.tokens";

@Injectable()
export class AgentsService {
  public constructor(
    @Inject(AGENT_DEFINITION_REPOSITORY)
    private readonly agents: PrismaAgentDefinitionRepository,
    @Inject(AuditService) private readonly audit: AuditService
  ) {}

  public async list(principal: RequestPrincipal): Promise<AgentDefinition[]> {
    const records = await this.agents.list(this.context(principal));
    return records.map((record) => this.toResponse(record));
  }

  public async findById(
    principal: RequestPrincipal,
    agentId: string
  ): Promise<AgentDefinition> {
    const record = await this.agents.findById(this.context(principal), agentId);
    if (!record) {
      throw new NotFoundException("Agent definition was not found.");
    }
    return this.toResponse(record);
  }

  public async create(
    principal: RequestPrincipal,
    input: CreateAgentDefinition
  ): Promise<AgentDefinition> {
    const record = await this.agents.create(this.context(principal), input);
    await this.audit.record(principal, {
      action: "agent.created",
      resourceType: "agent",
      resourceId: record.id,
      metadata: { provider: record.provider, model: record.model }
    });
    return this.toResponse(record);
  }

  public async update(
    principal: RequestPrincipal,
    agentId: string,
    input: UpdateAgentDefinition
  ): Promise<AgentDefinition> {
    const record = await this.agents.update(
      this.context(principal),
      agentId,
      input
    );
    if (!record) {
      throw new NotFoundException("Agent definition was not found.");
    }
    await this.audit.record(principal, {
      action: "agent.updated",
      resourceType: "agent",
      resourceId: record.id,
      metadata: { fields: Object.keys(input).sort() }
    });
    return this.toResponse(record);
  }

  public async delete(
    principal: RequestPrincipal,
    agentId: string
  ): Promise<void> {
    const deleted = await this.agents.delete(this.context(principal), agentId);
    if (!deleted) {
      throw new NotFoundException("Agent definition was not found.");
    }
    await this.audit.record(principal, {
      action: "agent.deleted",
      resourceType: "agent",
      resourceId: agentId
    });
  }

  private context(principal: RequestPrincipal): TenantContext {
    return {
      tenantId: principal.tenantId,
      userId: principal.userId,
      correlationId: principal.sessionId
    };
  }

  private toResponse(record: AgentDefinitionRecord): AgentDefinition {
    return {
      id: record.id,
      name: record.name,
      description: record.description,
      provider: record.provider,
      model: record.model,
      systemPrompt: record.systemPrompt,
      maxSteps: record.maxSteps,
      maxToolCalls: record.maxToolCalls,
      maxTokens: record.maxTokens,
      timeoutMs: record.timeoutMs,
      enabledToolIds: [...record.enabledToolIds],
      knowledgeBaseIds: [...record.knowledgeBaseIds],
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString()
    };
  }
}
