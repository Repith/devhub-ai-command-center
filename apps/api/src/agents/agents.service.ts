import { Inject, Injectable, NotFoundException } from "@nestjs/common";

import type {
  AgentDefinition,
  AgentTemplate,
  AgentTemplateKey,
  AgentTemplateRequirement,
  CreateAgentDefinition,
  InstallAgentTemplatesResponse,
  IntegrationSetupStatus,
  McpToolId,
  UpdateAgentDefinition
} from "@devhub/contracts";
import { DEFAULT_AGENT_TEMPLATES } from "@devhub/contracts";
import type {
  AgentDefinitionRecord,
  DatabaseClient,
  PrismaAgentDefinitionRepository
} from "@devhub/database";
import type { TenantContext } from "@devhub/domain";

import type { RequestPrincipal } from "../auth/auth.types";
import { AuditService } from "../audit/audit.service";
import { AGENT_DEFINITION_REPOSITORY } from "./agents.tokens";
import { DATABASE_CLIENT } from "../database/database.module";

interface TemplateSetupState {
  availableToolIds: ReadonlySet<McpToolId>;
  gmail: Extract<
    IntegrationSetupStatus,
    "READY" | "NEEDS_SETUP" | "MISCONFIGURED"
  >;
  hasEnabledNewsFeeds: boolean;
  hasIndexedKnowledge: boolean;
}

const AVAILABLE_TOOL_IDS: ReadonlySet<McpToolId> = new Set([
  "knowledge.search",
  "news.fetch_rss",
  "usage.summary",
  "gmail.search_threads",
  "gmail.get_thread",
  "gmail.create_draft",
  "gmail.update_draft"
]);

@Injectable()
export class AgentsService {
  public constructor(
    @Inject(AGENT_DEFINITION_REPOSITORY)
    private readonly agents: PrismaAgentDefinitionRepository,
    @Inject(DATABASE_CLIENT)
    private readonly database: DatabaseClient,
    @Inject(AuditService) private readonly audit: AuditService
  ) {}

  public async list(principal: RequestPrincipal): Promise<AgentDefinition[]> {
    const setup = await this.templateSetupState(principal);
    const records = await this.agents.list(this.context(principal));
    return records.map((record) => this.toResponse(record, setup));
  }

  public async findById(
    principal: RequestPrincipal,
    agentId: string
  ): Promise<AgentDefinition> {
    const record = await this.agents.findById(this.context(principal), agentId);
    if (!record) {
      throw new NotFoundException("Agent definition was not found.");
    }
    return this.toResponse(record, await this.templateSetupState(principal));
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
    return this.toResponse(record, await this.templateSetupState(principal));
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
    return this.toResponse(record, await this.templateSetupState(principal));
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

  public async listTemplates(
    principal: RequestPrincipal
  ): Promise<{ data: AgentTemplate[] }> {
    return { data: this.templates(await this.templateSetupState(principal)) };
  }

  public async installTemplates(
    principal: RequestPrincipal
  ): Promise<InstallAgentTemplatesResponse> {
    const records = await this.agents.installTemplates(
      this.context(principal),
      this.templates(await this.templateSetupState(principal))
    );
    await this.audit.record(principal, {
      action: "agent.templates_installed",
      resourceType: "agent_template",
      metadata: { count: records.length }
    });
    return this.templateResponse(
      records,
      await this.templateSetupState(principal)
    );
  }

  public async resetTemplates(
    principal: RequestPrincipal
  ): Promise<InstallAgentTemplatesResponse> {
    const records = await this.agents.resetTemplates(
      this.context(principal),
      this.templates(await this.templateSetupState(principal))
    );
    await this.audit.record(principal, {
      action: "agent.templates_reset",
      resourceType: "agent_template",
      metadata: { count: records.length }
    });
    return this.templateResponse(
      records,
      await this.templateSetupState(principal)
    );
  }

  private context(principal: RequestPrincipal): TenantContext {
    return {
      tenantId: principal.tenantId,
      userId: principal.userId,
      correlationId: principal.sessionId
    };
  }

  private toResponse(
    record: AgentDefinitionRecord,
    setup: TemplateSetupState
  ): AgentDefinition {
    return {
      id: record.id,
      name: record.name,
      description: record.description,
      templateKey: this.templateKey(record),
      templateSetup: this.templateSetup(record, setup),
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
    records: readonly AgentDefinitionRecord[],
    setup: TemplateSetupState
  ): InstallAgentTemplatesResponse {
    return {
      data: this.templates(setup),
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
    record: AgentDefinitionRecord,
    setup: TemplateSetupState
  ): AgentTemplateRequirement[] {
    const template = this.templateForRecord(record);
    return template ? this.dynamicRequirements(template, setup) : [];
  }

  private templateForRecord(
    record: AgentDefinitionRecord
  ): AgentTemplate | undefined {
    return DEFAULT_AGENT_TEMPLATES.find(
      (template) => template.key === record.templateKey
    );
  }

  private templates(setup: TemplateSetupState): AgentTemplate[] {
    const model = process.env.OLLAMA_CHAT_MODEL ?? "qwen3:8b";
    return DEFAULT_AGENT_TEMPLATES.map((template) => ({
      ...template,
      definition: {
        ...template.definition,
        model
      },
      requiredSetup: this.dynamicRequirements(template, setup)
    }));
  }

  private async templateSetupState(
    principal: RequestPrincipal
  ): Promise<TemplateSetupState> {
    const context = this.context(principal);
    const [indexedDocuments, enabledNewsFeeds, gmailConnection] =
      await Promise.all([
        this.database.document.count({
          where: {
            tenantId: context.tenantId,
            status: "INDEXED",
            deletedAt: null
          }
        }),
        this.database.tenantNewsFeed.count({
          where: {
            tenantId: context.tenantId,
            enabled: true,
            deletedAt: null
          }
        }),
        this.database.externalConnection.findUnique({
          where: {
            tenantId_userId_provider: {
              tenantId: context.tenantId,
              userId: context.userId,
              provider: "GMAIL"
            }
          },
          select: {
            encryptedRefreshToken: true,
            status: true,
            expiresAt: true
          }
        })
      ]);
    return {
      availableToolIds: AVAILABLE_TOOL_IDS,
      gmail: gmailSetupStatus(gmailConnection),
      hasEnabledNewsFeeds: enabledNewsFeeds > 0,
      hasIndexedKnowledge: indexedDocuments > 0
    };
  }

  private dynamicRequirements(
    template: AgentTemplate,
    setup: TemplateSetupState
  ): AgentTemplateRequirement[] {
    return template.requiredSetup.map((requirement) => ({
      ...requirement,
      status: requirementStatus(template.key, requirement, setup)
    }));
  }
}

function requirementStatus(
  templateKey: AgentTemplateKey,
  requirement: AgentTemplateRequirement,
  setup: TemplateSetupState
): IntegrationSetupStatus {
  if (requirement.status === "PLANNED") {
    return "PLANNED";
  }
  if (isToolRequirement(requirement.id)) {
    return setup.availableToolIds.has(requirement.id) ? "READY" : "PLANNED";
  }
  if (requirement.id === "gmail.oauth") {
    return setup.gmail;
  }
  if (requirement.id === "tenant-news-feeds") {
    return setup.hasEnabledNewsFeeds ? "READY" : "NEEDS_SETUP";
  }
  if (requirement.id === "knowledge.documents") {
    return setup.hasIndexedKnowledge ? "READY" : "NEEDS_SETUP";
  }
  return templateKey === "usage-analyst" ? "READY" : requirement.status;
}

function isToolRequirement(id: string): id is McpToolId {
  return AVAILABLE_TOOL_IDS.has(id as McpToolId);
}

function gmailSetupStatus(
  connection: {
    encryptedRefreshToken: string | null;
    expiresAt: Date | null;
    status: "CONNECTED" | "DISCONNECTED" | "EXPIRED";
  } | null
): Extract<IntegrationSetupStatus, "READY" | "NEEDS_SETUP" | "MISCONFIGURED"> {
  if (!isGmailRuntimeConfigured()) {
    return connection ? "MISCONFIGURED" : "NEEDS_SETUP";
  }
  if (!connection?.encryptedRefreshToken || connection.status !== "CONNECTED") {
    return "NEEDS_SETUP";
  }
  if (connection.expiresAt && connection.expiresAt.getTime() <= Date.now()) {
    return "NEEDS_SETUP";
  }
  return "READY";
}

function isGmailRuntimeConfigured(): boolean {
  return Boolean(
    process.env.GMAIL_CLIENT_ID &&
    process.env.GMAIL_CLIENT_SECRET &&
    process.env.GMAIL_TOKEN_ENCRYPTION_KEY
  );
}
