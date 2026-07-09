import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException
} from "@nestjs/common";

import type {
  AgentDefinition,
  AgentTemplate,
  AgentTemplateKey,
  AgentTemplateRequirement,
  AgentWorkflowDefinition,
  AgentWorkflowNode,
  AgentWorkflowResponse,
  AgentWorkflowValidationIssue,
  AgentWorkflowValidationResponse,
  CreateAgentDefinition,
  InstallAgentTemplatesResponse,
  IntegrationSetupStatus,
  McpToolId,
  UpdateAgentDefinition
} from "@devhub/contracts";
import {
  DEFAULT_AGENT_TEMPLATES,
  agentWorkflowDefinitionSchema
} from "@devhub/contracts";
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
  hasAuthorizedGithubRepositories: boolean;
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
  "gmail.update_draft",
  "github.list_repositories",
  "github.get_file",
  "github.search_code",
  "github.list_issues",
  "github.list_pull_requests",
  "github.get_pull_request"
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

  public async getWorkflow(
    principal: RequestPrincipal,
    agentId: string
  ): Promise<AgentWorkflowResponse> {
    const workflow = await this.agents.findWorkflow(
      this.context(principal),
      agentId
    );
    if (!workflow) {
      throw new NotFoundException("Agent definition was not found.");
    }
    return workflow;
  }

  public async validateWorkflow(
    principal: RequestPrincipal,
    agentId: string,
    input: unknown
  ): Promise<AgentWorkflowValidationResponse> {
    const record = await this.agents.findById(this.context(principal), agentId);
    if (!record) {
      throw new NotFoundException("Agent definition was not found.");
    }
    const result = agentWorkflowDefinitionSchema.safeParse(input);
    if (!result.success) {
      return {
        valid: false,
        errors: result.error.issues.map((issue) => ({
          code: issue.code,
          message: issue.message,
          path: issue.path.filter(
            (part): part is string | number =>
              typeof part === "string" || typeof part === "number"
          )
        }))
      };
    }
    const errors = workflowToolIssues(result.data, record.enabledToolIds);
    return {
      valid: errors.length === 0,
      errors
    };
  }

  public async saveWorkflow(
    principal: RequestPrincipal,
    agentId: string,
    definition: AgentWorkflowDefinition
  ): Promise<AgentWorkflowResponse> {
    const record = await this.agents.findById(this.context(principal), agentId);
    if (!record) {
      throw new NotFoundException("Agent definition was not found.");
    }
    const errors = workflowToolIssues(definition, record.enabledToolIds);
    if (errors.length > 0) {
      throw new BadRequestException({
        code: "WORKFLOW_VALIDATION_ERROR",
        issues: errors
      });
    }
    const workflow = await this.agents.saveWorkflow(
      this.context(principal),
      agentId,
      definition
    );
    if (!workflow) {
      throw new NotFoundException("Agent definition was not found.");
    }
    await this.audit.record(principal, {
      action: "agent.workflow_saved",
      resourceType: "agent",
      resourceId: agentId,
      metadata: { workflowVersion: workflow.version }
    });
    return workflow;
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
      metadata: { ...records.actionCounts, count: records.records.length }
    });
    return this.templateResponse(
      records.records,
      records.actionCounts,
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
      metadata: { ...records.actionCounts, count: records.records.length }
    });
    return this.templateResponse(
      records.records,
      records.actionCounts,
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
      workflowVersion: record.workflowVersion,
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
    actionCounts: InstallAgentTemplatesResponse["actionCounts"],
    setup: TemplateSetupState
  ): InstallAgentTemplatesResponse {
    return {
      data: this.templates(setup),
      installedAgentIds: records.map((record) => record.id),
      actionCounts
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
    const [
      indexedDocuments,
      enabledNewsFeeds,
      githubRepositories,
      gmailConnection
    ] = await Promise.all([
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
      this.database.externalRepository.count({
        where: {
          tenantId: context.tenantId,
          provider: "GITHUB",
          deletedAt: null,
          installation: {
            status: "ACTIVE",
            deletedAt: null
          }
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
      hasAuthorizedGithubRepositories: githubRepositories > 0,
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
  if (requirement.id === "github.installation") {
    return setup.hasAuthorizedGithubRepositories ? "READY" : "NEEDS_SETUP";
  }
  return templateKey === "usage-analyst" ? "READY" : requirement.status;
}

function isToolRequirement(id: string): id is McpToolId {
  return AVAILABLE_TOOL_IDS.has(id as McpToolId);
}

function workflowToolIssues(
  definition: AgentWorkflowDefinition,
  enabledToolIds: readonly string[]
): AgentWorkflowValidationIssue[] {
  const enabledTools = new Set(enabledToolIds);
  return definition.nodes.flatMap((node, index) => {
    const toolId = workflowToolIdForNode(node);
    if (!toolId || enabledTools.has(toolId)) {
      return [];
    }
    return [
      {
        code: "TOOL_NOT_ENABLED",
        message: `Workflow tool "${toolId}" is not enabled for this agent.`,
        path: ["nodes", index, "type"]
      }
    ];
  });
}

function workflowToolIdForNode(node: AgentWorkflowNode): McpToolId | null {
  if (
    node.type === "knowledge.search" ||
    node.type === "news.fetch_rss" ||
    node.type === "usage.summary" ||
    node.type === "gmail.search_threads" ||
    node.type === "gmail.get_thread" ||
    node.type === "gmail.create_draft" ||
    node.type === "gmail.update_draft"
  ) {
    return node.type;
  }
  return null;
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
  const oauthConfigured = Boolean(
    process.env.GMAIL_CLIENT_ID &&
    process.env.GMAIL_CLIENT_SECRET &&
    process.env.GMAIL_REDIRECT_URI &&
    process.env.GMAIL_TOKEN_ENCRYPTION_KEY
  );
  const devMockConfigured = Boolean(
    process.env.GMAIL_DEV_MOCK_ENABLED === "true" &&
    process.env.GMAIL_TOKEN_ENCRYPTION_KEY
  );
  return oauthConfigured || devMockConfigured;
}
