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
}

export interface CreateAgentDefinition {
  name: string;
  description?: string;
  provider: string;
  model: string;
  systemPrompt: string;
  maxSteps?: number;
  maxToolCalls?: number;
  maxTokens?: number;
  timeoutMs?: number;
  enabledToolIds?: readonly string[];
  knowledgeBaseIds?: readonly string[];
}

export type UpdateAgentDefinition = Partial<CreateAgentDefinition>;

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
        ...input,
        enabledToolIds: [...(input.enabledToolIds ?? [])],
        knowledgeBaseIds: [...(input.knowledgeBaseIds ?? [])],
        tenantId: context.tenantId
      }
    });
  }

  public async update(
    context: TenantContext,
    id: string,
    input: UpdateAgentDefinition
  ): Promise<AgentDefinitionRecord | null> {
    const { enabledToolIds, knowledgeBaseIds, ...scalarInput } = input;
    const result = await this.database.agentDefinition.updateManyAndReturn({
      where: { id, tenantId: context.tenantId, deletedAt: null },
      data: {
        ...scalarInput,
        ...(enabledToolIds ? { enabledToolIds: [...enabledToolIds] } : {}),
        ...(knowledgeBaseIds ? { knowledgeBaseIds: [...knowledgeBaseIds] } : {})
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
