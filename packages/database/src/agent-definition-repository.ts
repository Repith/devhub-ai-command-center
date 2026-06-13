import type {
  AgentTemplate,
  CreateAgentDefinition,
  UpdateAgentDefinition
} from "@devhub/contracts";
import type { TenantContext, TenantMutableRepository } from "@devhub/domain";

import type { DatabaseClient } from "./client.js";

export interface AgentDefinitionRecord {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  provider: string;
  model: string;
  systemPrompt: string;
  templateKey: string | null;
  maxSteps: number;
  maxToolCalls: number;
  maxTokens: number | null;
  timeoutMs: number;
  enabledToolIds: readonly string[];
  knowledgeBaseIds: readonly string[];
  createdAt: Date;
  updatedAt: Date;
}

export class PrismaAgentDefinitionRepository implements TenantMutableRepository<
  AgentDefinitionRecord,
  CreateAgentDefinition,
  UpdateAgentDefinition
> {
  public constructor(private readonly database: DatabaseClient) {}

  public async findById(
    context: TenantContext,
    id: string
  ): Promise<AgentDefinitionRecord | null> {
    return this.database.agentDefinition.findFirst({
      where: { id, tenantId: context.tenantId, deletedAt: null }
    });
  }

  public async list(
    context: TenantContext
  ): Promise<readonly AgentDefinitionRecord[]> {
    return this.database.agentDefinition.findMany({
      where: { tenantId: context.tenantId, deletedAt: null },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }]
    });
  }

  public async create(
    context: TenantContext,
    input: CreateAgentDefinition
  ): Promise<AgentDefinitionRecord> {
    return this.database.agentDefinition.create({
      data: {
        tenantId: context.tenantId,
        name: input.name,
        description: input.description ?? null,
        provider: input.provider,
        model: input.model,
        systemPrompt: input.systemPrompt,
        templateKey: null,
        maxSteps: input.maxSteps,
        maxToolCalls: input.maxToolCalls,
        maxTokens: input.maxTokens ?? null,
        timeoutMs: input.timeoutMs,
        enabledToolIds: [...input.enabledToolIds],
        knowledgeBaseIds: [...input.knowledgeBaseIds]
      }
    });
  }

  public async update(
    context: TenantContext,
    id: string,
    input: UpdateAgentDefinition
  ): Promise<AgentDefinitionRecord | null> {
    const result = await this.database.agentDefinition.updateManyAndReturn({
      where: { id, tenantId: context.tenantId, deletedAt: null },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined
          ? { description: input.description }
          : {}),
        ...(input.provider !== undefined ? { provider: input.provider } : {}),
        ...(input.model !== undefined ? { model: input.model } : {}),
        ...(input.systemPrompt !== undefined
          ? { systemPrompt: input.systemPrompt }
          : {}),
        ...(input.maxSteps !== undefined ? { maxSteps: input.maxSteps } : {}),
        ...(input.maxToolCalls !== undefined
          ? { maxToolCalls: input.maxToolCalls }
          : {}),
        ...(input.maxTokens !== undefined
          ? { maxTokens: input.maxTokens }
          : {}),
        ...(input.timeoutMs !== undefined
          ? { timeoutMs: input.timeoutMs }
          : {}),
        ...(input.enabledToolIds !== undefined
          ? { enabledToolIds: [...input.enabledToolIds] }
          : {}),
        ...(input.knowledgeBaseIds !== undefined
          ? { knowledgeBaseIds: [...input.knowledgeBaseIds] }
          : {})
      }
    });

    return result[0] ?? null;
  }

  public async delete(context: TenantContext, id: string): Promise<boolean> {
    const result = await this.database.agentDefinition.updateMany({
      where: { id, tenantId: context.tenantId, deletedAt: null },
      data: { deletedAt: new Date() }
    });

    return result.count === 1;
  }

  public async installTemplates(
    context: TenantContext,
    templates: readonly AgentTemplate[]
  ): Promise<readonly AgentDefinitionRecord[]> {
    const records: AgentDefinitionRecord[] = [];
    for (const template of templates) {
      records.push(await this.installTemplate(context, template));
    }
    return records;
  }

  public async resetTemplates(
    context: TenantContext,
    templates: readonly AgentTemplate[]
  ): Promise<readonly AgentDefinitionRecord[]> {
    const records: AgentDefinitionRecord[] = [];
    for (const template of templates) {
      records.push(await this.resetTemplate(context, template));
    }
    return records;
  }

  private async installTemplate(
    context: TenantContext,
    template: AgentTemplate
  ): Promise<AgentDefinitionRecord> {
    const existing = await this.database.agentDefinition.findFirst({
      where: { tenantId: context.tenantId, templateKey: template.key }
    });
    if (existing && existing.deletedAt === null) {
      return existing;
    }
    if (existing) {
      return this.database.agentDefinition.update({
        where: { id: existing.id },
        data: {
          ...this.templateData(template),
          deletedAt: null
        }
      });
    }
    return this.database.agentDefinition.create({
      data: {
        tenantId: context.tenantId,
        templateKey: template.key,
        ...this.templateData(template)
      }
    });
  }

  private resetTemplate(
    context: TenantContext,
    template: AgentTemplate
  ): Promise<AgentDefinitionRecord> {
    return this.database.agentDefinition.upsert({
      where: {
        tenantId_templateKey: {
          tenantId: context.tenantId,
          templateKey: template.key
        }
      },
      update: {
        ...this.templateData(template),
        deletedAt: null
      },
      create: {
        tenantId: context.tenantId,
        templateKey: template.key,
        ...this.templateData(template)
      }
    });
  }

  private templateData(template: AgentTemplate): {
    name: string;
    description: string | null;
    provider: string;
    model: string;
    systemPrompt: string;
    maxSteps: number;
    maxToolCalls: number;
    maxTokens: number | null;
    timeoutMs: number;
    enabledToolIds: string[];
    knowledgeBaseIds: string[];
  } {
    return {
      name: template.definition.name,
      description: template.definition.description ?? null,
      provider: template.definition.provider,
      model: template.definition.model,
      systemPrompt: template.definition.systemPrompt,
      maxSteps: template.definition.maxSteps,
      maxToolCalls: template.definition.maxToolCalls,
      maxTokens: template.definition.maxTokens ?? null,
      timeoutMs: template.definition.timeoutMs,
      enabledToolIds: [...template.definition.enabledToolIds],
      knowledgeBaseIds: [...template.definition.knowledgeBaseIds]
    };
  }
}
