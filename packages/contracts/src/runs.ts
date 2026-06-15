import { z } from "zod";

import { uuidSchema } from "./api.js";
import { agentTemplateKeySchema } from "./agents.js";
import { agentWorkflowDefinitionSchema } from "./agent-workflows.js";
import { mcpToolIdSchema } from "./mcp.js";
import { agentRunStatusSchema, runStepStatusSchema } from "./statuses.js";

export const createAgentRunSchema = z
  .object({
    message: z.string().trim().min(1).max(20_000),
    conversationId: uuidSchema.optional(),
    documentIds: z.array(uuidSchema).max(50).optional(),
    retrievalLimit: z.number().int().min(1).max(20).default(5),
    newsFeedIds: z.array(uuidSchema).max(10).optional(),
    rssUrl: z.url().optional(),
    gmailSearchQuery: z.string().trim().min(1).max(500).optional(),
    gmailThreadId: z.string().trim().min(1).max(256).optional(),
    gmailDraftReviewId: uuidSchema.optional()
  })
  .strict();
export type CreateAgentRun = z.infer<typeof createAgentRunSchema>;

export const agentRunConfigSnapshotSchema = z
  .object({
    agentId: uuidSchema,
    provider: z.string().min(1),
    model: z.string().min(1),
    systemPrompt: z.string().min(1),
    templateKey: agentTemplateKeySchema.nullable().optional(),
    maxSteps: z.number().int().min(1),
    maxToolCalls: z.number().int().min(0),
    maxTokens: z.number().int().positive().nullable(),
    timeoutMs: z.number().int().min(1),
    enabledToolIds: z.array(z.string().min(1)),
    knowledgeBaseIds: z.array(uuidSchema),
    configVersion: z.string().min(1).optional(),
    workflowVersion: z.number().int().positive().nullable().optional(),
    workflowDefinition: agentWorkflowDefinitionSchema.nullable().optional()
  })
  .strict();
export type AgentRunConfigSnapshot = z.infer<
  typeof agentRunConfigSnapshotSchema
>;

export const agentRunSchema = z.object({
  id: uuidSchema,
  agentId: uuidSchema,
  conversationId: uuidSchema.nullable(),
  status: agentRunStatusSchema,
  input: createAgentRunSchema,
  configSnapshot: agentRunConfigSnapshotSchema,
  correlationId: z.string().min(1),
  startedAt: z.iso.datetime().nullable(),
  completedAt: z.iso.datetime().nullable(),
  errorCode: z.string().nullable(),
  errorMessage: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime()
});
export type AgentRun = z.infer<typeof agentRunSchema>;

export const agentRunStepSchema = z.object({
  id: uuidSchema,
  agentRunId: uuidSchema,
  sequence: z.number().int().nonnegative(),
  kind: z.string().min(1),
  status: runStepStatusSchema,
  inputPreview: z.string().nullable(),
  outputPreview: z.string().nullable(),
  durationMs: z.number().int().nonnegative().nullable(),
  errorCode: z.string().nullable(),
  errorMessage: z.string().nullable(),
  startedAt: z.iso.datetime().nullable(),
  completedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime()
});
export type AgentRunStep = z.infer<typeof agentRunStepSchema>;

export const agentRunListSchema = z.object({
  data: z.array(agentRunSchema),
  page: z.object({
    cursor: z.null(),
    nextCursor: z.null(),
    limit: z.number().int().min(1).max(100)
  })
});
export type AgentRunList = z.infer<typeof agentRunListSchema>;

export const agentRunStepListSchema = z.object({
  data: z.array(agentRunStepSchema),
  page: z.object({
    cursor: z.null(),
    nextCursor: z.null(),
    limit: z.number().int().min(1).max(1000)
  })
});
export type AgentRunStepList = z.infer<typeof agentRunStepListSchema>;

export const agentRunSnapshotSchema = z.object({
  run: agentRunSchema,
  steps: z.array(agentRunStepSchema)
});
export type AgentRunSnapshot = z.infer<typeof agentRunSnapshotSchema>;

export const agentRunJobSchema = z
  .object({
    version: z.literal(1),
    tenantId: uuidSchema,
    userId: uuidSchema,
    correlationId: z.string().min(1),
    runId: uuidSchema
  })
  .strict();
export type AgentRunJob = z.infer<typeof agentRunJobSchema>;

export const agentRunToolOutputSchema = z.object({
  toolId: mcpToolIdSchema,
  outputPreview: z.string()
});
export type AgentRunToolOutput = z.infer<typeof agentRunToolOutputSchema>;
