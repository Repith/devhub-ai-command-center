import { Inject, Injectable, NotFoundException } from "@nestjs/common";

import type {
  AgentDefinition,
  AgentTemplate,
  AgentTemplateRequirement,
  CreateAgentDefinition,
  InstallAgentTemplatesResponse,
  UpdateAgentDefinition
} from "@devhub/contracts";
import { DEFAULT_AGENT_TEMPLATES } from "@devhub/contracts";
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

  public listTemplates(): { data: AgentTemplate[] } {
    return { data: this.templates() };
  }

  public async installTemplates(
    principal: RequestPrincipal
  ): Promise<InstallAgentTemplatesResponse> {
    const records = await this.agents.installTemplates(
      this.context(principal),
      this.templates()
    );
    await this.audit.record(principal, {
      action: "agent.templates_installed",
      resourceType: "agent_template",
      metadata: { count: records.length }
    });
    return this.templateResponse(records);
  }

  public async resetTemplates(
    principal: RequestPrincipal
  ): Promise<InstallAgentTemplatesResponse> {
    const records = await this.agents.resetTemplates(
      this.context(principal),
      this.templates()
    );
    await this.audit.record(principal, {
      action: "agent.templates_reset",
      resourceType: "agent_template",
      metadata: { count: records.length }
    });
    return this.templateResponse(records);
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
      templateKey: this.templateKey(record),
      templateSetup: this.templateSetup(record),
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

  private templateResponse(
    records: readonly AgentDefinitionRecord[]
  ): InstallAgentTemplatesResponse {
    return {
      data: this.templates(),
      installedAgentIds: records.map((record) => record.id)
    };
  }

  private templateKey(
    record: AgentDefinitionRecord
  ): AgentDefinition["templateKey"] {
    const template = this.templateForRecord(record);
    return template?.key ?? null;
  }

  private templateSetup(
    record: AgentDefinitionRecord
  ): AgentTemplateRequirement[] {
    return this.templateForRecord(record)?.requiredSetup ?? [];
  }

  private templateForRecord(
    record: AgentDefinitionRecord
  ): AgentTemplate | undefined {
    return DEFAULT_AGENT_TEMPLATES.find(
      (template) => template.key === record.templateKey
    );
  }

  private templates(): AgentTemplate[] {
    const model = process.env.OLLAMA_CHAT_MODEL ?? "qwen3:8b";
    return DEFAULT_AGENT_TEMPLATES.map((template) => ({
      ...template,
      definition: {
        ...template.definition,
        model
      },
      requiredSetup: [...template.requiredSetup]
    }));
  }
}
