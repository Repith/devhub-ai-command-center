import type {
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
}
