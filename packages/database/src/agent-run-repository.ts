import { randomUUID } from "node:crypto";

import type {
  AgentRun,
  AgentRunConfigSnapshot,
  AgentRunStep,
  CreateAgentRun,
  RunStepStatus
} from "@devhub/contracts";
import { agentTemplateKeySchema } from "@devhub/contracts";
import type { TenantContext } from "@devhub/domain";

import type { AgentDefinitionRecord } from "./agent-definition-repository.js";
import type { DatabaseClient } from "./client.js";
import type { Prisma } from "./generated/prisma/client.js";

export interface AgentRunRecord {
  id: string;
  tenantId: string;
  agentId: string;
  conversationId: string | null;
  status: AgentRun["status"];
  input: unknown;
  configSnapshot: unknown;
  correlationId: string;
  startedAt: Date | null;
  completedAt: Date | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AgentRunStepRecord {
  id: string;
  tenantId: string;
  agentRunId: string;
  sequence: number;
  kind: string;
  status: RunStepStatus;
  inputPreview: string | null;
  outputPreview: string | null;
  durationMs: number | null;
  errorCode: string | null;
  errorMessage: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CompleteStepInput {
  outputPreview: string;
  durationMs: number;
  assistantMessage?: {
    agentId: string;
    content: string;
    conversationId: string;
  };
  provider?: string;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  retryCount?: number;
}

export class PrismaAgentRunRepository {
  public constructor(private readonly database: DatabaseClient) {}

  public async createQueued(
    context: TenantContext,
    agent: AgentDefinitionRecord,
    input: CreateAgentRun
  ): Promise<AgentRunRecord> {
    return this.database.agentRun.create({
      data: {
        tenantId: context.tenantId,
        agentId: agent.id,
        conversationId: input.conversationId ?? null,
        input: input as Prisma.InputJsonValue,
        configSnapshot: snapshotAgent(agent) as Prisma.InputJsonValue,
        correlationId: runCorrelationId()
      }
    });
  }

  public async createQueuedWithUserMessage(
    context: TenantContext,
    agent: AgentDefinitionRecord,
    input: CreateAgentRun
  ): Promise<AgentRunRecord> {
    return this.database.$transaction(async (transaction) => {
      const conversationId =
        input.conversationId ??
        (
          await transaction.conversation.create({
            data: {
              tenantId: context.tenantId,
              agentId: agent.id,
              title: titleFrom(input.message),
              messages: {
                create: {
                  role: "USER",
                  content: input.message,
                  sequence: 1
                }
              }
            }
          })
        ).id;

      if (input.conversationId) {
        const locked = await transaction.conversation.updateMany({
          where: {
            id: input.conversationId,
            tenantId: context.tenantId,
            agentId: agent.id,
            deletedAt: null
          },
          data: { updatedAt: new Date() }
        });
        if (locked.count !== 1) {
          throw new ConversationNotFoundError();
        }
        const latest = await transaction.message.findFirst({
          where: { tenantId: context.tenantId, conversationId },
          orderBy: { sequence: "desc" }
        });
        await transaction.message.create({
          data: {
            tenantId: context.tenantId,
            conversationId,
            role: "USER",
            content: input.message,
            sequence: (latest?.sequence ?? 0) + 1
          }
        });
      }

      const runInput: CreateAgentRun = { ...input, conversationId };
      return transaction.agentRun.create({
        data: {
          tenantId: context.tenantId,
          agentId: agent.id,
          conversationId,
          input: runInput as Prisma.InputJsonValue,
          configSnapshot: snapshotAgent(agent) as Prisma.InputJsonValue,
          correlationId: runCorrelationId()
        }
      });
    });
  }

  public async list(
    context: TenantContext
  ): Promise<readonly AgentRunRecord[]> {
    return this.database.agentRun.findMany({
      where: { tenantId: context.tenantId },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      take: 100
    });
  }

  public async findById(
    context: TenantContext,
    runId: string
  ): Promise<AgentRunRecord | null> {
    return this.database.agentRun.findFirst({
      where: { id: runId, tenantId: context.tenantId }
    });
  }

  public async listSteps(
    context: TenantContext,
    runId: string
  ): Promise<readonly AgentRunStepRecord[] | null> {
    const run = await this.findById(context, runId);
    if (!run) {
      return null;
    }
    return this.database.agentRunStep.findMany({
      where: { tenantId: context.tenantId, agentRunId: runId },
      orderBy: [{ sequence: "asc" }, { id: "asc" }]
    });
  }

  public async markRunning(
    context: TenantContext,
    runId: string
  ): Promise<AgentRunRecord | null> {
    const updated = await this.database.agentRun.updateManyAndReturn({
      where: {
        id: runId,
        tenantId: context.tenantId,
        status: { in: ["QUEUED", "RUNNING"] }
      },
      data: { status: "RUNNING", startedAt: new Date() }
    });
    return updated[0] ?? null;
  }

  public async requestCancellation(
    context: TenantContext,
    runId: string
  ): Promise<AgentRunRecord | null> {
    const updated = await this.database.agentRun.updateManyAndReturn({
      where: {
        id: runId,
        tenantId: context.tenantId,
        status: { in: ["QUEUED", "RUNNING"] }
      },
      data: { status: "CANCEL_REQUESTED" }
    });
    return updated[0] ?? null;
  }

  public async isCancellationRequested(
    context: TenantContext,
    runId: string
  ): Promise<boolean> {
    const run = await this.database.agentRun.findFirst({
      where: { id: runId, tenantId: context.tenantId },
      select: { status: true }
    });
    return run?.status === "CANCEL_REQUESTED" || run?.status === "CANCELLED";
  }

  public async markCompleted(
    context: TenantContext,
    runId: string
  ): Promise<AgentRunRecord | null> {
    return this.finish(context, runId, "COMPLETED", null, null);
  }

  public async markCancelled(
    context: TenantContext,
    runId: string
  ): Promise<AgentRunRecord | null> {
    return this.finish(context, runId, "CANCELLED", "RUN_CANCELLED", null);
  }

  public async markTimedOut(
    context: TenantContext,
    runId: string,
    message: string
  ): Promise<AgentRunRecord | null> {
    return this.finish(context, runId, "TIMED_OUT", "RUN_TIMED_OUT", message);
  }

  public async markFailed(
    context: TenantContext,
    runId: string,
    code: string,
    message: string
  ): Promise<AgentRunRecord | null> {
    return this.finish(context, runId, "FAILED", code, message);
  }

  public async startStep(
    context: TenantContext,
    runId: string,
    sequence: number,
    kind: string,
    inputPreview: string
  ): Promise<AgentRunStepRecord> {
    const existing = await this.database.agentRunStep.findUnique({
      where: {
        tenantId_agentRunId_sequence: {
          tenantId: context.tenantId,
          agentRunId: runId,
          sequence
        }
      }
    });
    if (existing?.status === "COMPLETED" || existing?.status === "SKIPPED") {
      return existing;
    }
    if (existing) {
      return this.database.agentRunStep.update({
        where: { id: existing.id },
        data: {
          status: "RUNNING",
          inputPreview,
          errorCode: null,
          errorMessage: null,
          startedAt: new Date()
        }
      });
    }
    return this.database.agentRunStep.create({
      data: {
        tenantId: context.tenantId,
        agentRunId: runId,
        sequence,
        kind,
        status: "RUNNING",
        inputPreview,
        startedAt: new Date()
      }
    });
  }

  public async completeStep(
    context: TenantContext,
    stepId: string,
    input: CompleteStepInput
  ): Promise<AgentRunStepRecord> {
    return this.database.$transaction(async (transaction) => {
      const step = await transaction.agentRunStep.update({
        where: { tenantId_id: { tenantId: context.tenantId, id: stepId } },
        data: {
          status: "COMPLETED",
          outputPreview: input.outputPreview,
          durationMs: input.durationMs,
          completedAt: new Date(),
          errorCode: null,
          errorMessage: null
        }
      });
      if (input.provider && input.model) {
        await transaction.tokenUsage.create({
          data: {
            tenantId: context.tenantId,
            agentRunId: step.agentRunId,
            runStepId: step.id,
            provider: input.provider,
            model: input.model,
            inputTokens: input.inputTokens ?? 0,
            outputTokens: input.outputTokens ?? 0,
            latencyMs: input.durationMs,
            retryCount: input.retryCount ?? 0
          }
        });
      }
      if (input.assistantMessage && input.provider && input.model) {
        const locked = await transaction.conversation.updateMany({
          where: {
            id: input.assistantMessage.conversationId,
            tenantId: context.tenantId,
            agentId: input.assistantMessage.agentId,
            deletedAt: null
          },
          data: { updatedAt: new Date() }
        });
        if (locked.count !== 1) {
          throw new ConversationNotFoundError();
        }
        const latest = await transaction.message.findFirst({
          where: {
            tenantId: context.tenantId,
            conversationId: input.assistantMessage.conversationId
          },
          orderBy: { sequence: "desc" }
        });
        await transaction.message.create({
          data: {
            tenantId: context.tenantId,
            conversationId: input.assistantMessage.conversationId,
            role: "ASSISTANT",
            content: input.assistantMessage.content,
            sequence: (latest?.sequence ?? 0) + 1,
            provider: input.provider,
            model: input.model,
            inputTokens: input.inputTokens ?? 0,
            outputTokens: input.outputTokens ?? 0,
            durationMs: input.durationMs
          }
        });
      }
      return step;
    });
  }

  public async skipStep(
    context: TenantContext,
    stepId: string,
    outputPreview: string,
    durationMs: number
  ): Promise<AgentRunStepRecord> {
    return this.database.agentRunStep.update({
      where: { tenantId_id: { tenantId: context.tenantId, id: stepId } },
      data: {
        status: "SKIPPED",
        outputPreview,
        durationMs,
        completedAt: new Date()
      }
    });
  }

  public async failStep(
    context: TenantContext,
    stepId: string,
    code: string,
    message: string,
    durationMs: number
  ): Promise<AgentRunStepRecord> {
    return this.database.agentRunStep.update({
      where: { tenantId_id: { tenantId: context.tenantId, id: stepId } },
      data: {
        status: "FAILED",
        durationMs,
        errorCode: code,
        errorMessage: message.slice(0, 1000),
        completedAt: new Date()
      }
    });
  }

  public toRunResponse(record: AgentRunRecord): AgentRun {
    return {
      id: record.id,
      agentId: record.agentId,
      conversationId: record.conversationId,
      status: record.status,
      input: record.input as AgentRun["input"],
      configSnapshot: record.configSnapshot as AgentRunConfigSnapshot,
      correlationId: record.correlationId,
      startedAt: record.startedAt?.toISOString() ?? null,
      completedAt: record.completedAt?.toISOString() ?? null,
      errorCode: record.errorCode,
      errorMessage: record.errorMessage,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString()
    };
  }

  public toStepResponse(record: AgentRunStepRecord): AgentRunStep {
    return {
      id: record.id,
      agentRunId: record.agentRunId,
      sequence: record.sequence,
      kind: record.kind,
      status: record.status,
      inputPreview: record.inputPreview,
      outputPreview: record.outputPreview,
      durationMs: record.durationMs,
      errorCode: record.errorCode,
      errorMessage: record.errorMessage,
      startedAt: record.startedAt?.toISOString() ?? null,
      completedAt: record.completedAt?.toISOString() ?? null,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString()
    };
  }

  private async finish(
    context: TenantContext,
    runId: string,
    status: AgentRun["status"],
    errorCode: string | null,
    errorMessage: string | null
  ): Promise<AgentRunRecord | null> {
    const updated = await this.database.agentRun.updateManyAndReturn({
      where: { id: runId, tenantId: context.tenantId },
      data: {
        status,
        completedAt: new Date(),
        errorCode,
        errorMessage: errorMessage?.slice(0, 1000) ?? null
      }
    });
    return updated[0] ?? null;
  }
}

export class ConversationNotFoundError extends Error {
  public constructor() {
    super("Conversation was not found.");
    this.name = "ConversationNotFoundError";
  }
}

function snapshotAgent(agent: AgentDefinitionRecord): AgentRunConfigSnapshot {
  return {
    agentId: agent.id,
    provider: agent.provider,
    model: agent.model,
    systemPrompt: agent.systemPrompt,
    templateKey: templateKey(agent.templateKey),
    maxSteps: agent.maxSteps,
    maxToolCalls: agent.maxToolCalls,
    maxTokens: agent.maxTokens,
    timeoutMs: agent.timeoutMs,
    enabledToolIds: [...agent.enabledToolIds],
    knowledgeBaseIds: [...agent.knowledgeBaseIds],
    configVersion: configVersion(agent),
    workflowVersion: agent.workflowVersion,
    workflowDefinition: (agent.workflowDefinition ??
      null) as AgentRunConfigSnapshot["workflowDefinition"]
  };
}

function configVersion(agent: AgentDefinitionRecord): string {
  const workflowVersion = agent.workflowVersion ?? "default";
  return `agent:${agent.updatedAt.toISOString()}:workflow:${workflowVersion}`;
}

function templateKey(
  value: string | null
): AgentRunConfigSnapshot["templateKey"] {
  const result = agentTemplateKeySchema.safeParse(value);
  return result.success ? result.data : null;
}

function titleFrom(content: string): string {
  return content.replace(/\s+/g, " ").trim().slice(0, 120);
}

function runCorrelationId(): string {
  return randomUUID();
}
