import { z } from "zod";

import { uuidSchema } from "./api.js";

export const agentTemplateKeySchema = z.enum([
  "knowledge-researcher",
  "daily-news-briefing",
  "gmail-triage",
  "gmail-reply-assistant",
  "usage-analyst"
]);
export type AgentTemplateKey = z.infer<typeof agentTemplateKeySchema>;

export const integrationSetupStatusSchema = z.enum([
  "READY",
  "NEEDS_SETUP",
  "PLANNED"
]);
export type IntegrationSetupStatus = z.infer<
  typeof integrationSetupStatusSchema
>;

export const agentTemplateRequirementSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
    status: integrationSetupStatusSchema
  })
  .strict();
export type AgentTemplateRequirement = z.infer<
  typeof agentTemplateRequirementSchema
>;

export const createAgentDefinitionSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(500).optional(),
    provider: z.string().trim().min(1).max(80),
    model: z.string().trim().min(1).max(160),
    systemPrompt: z.string().min(1).max(50_000),
    maxSteps: z.number().int().min(1).max(100).default(8),
    maxToolCalls: z.number().int().min(0).max(100).default(4),
    maxTokens: z.number().int().positive().optional(),
    timeoutMs: z.number().int().min(1_000).max(3_600_000).default(120_000),
    enabledToolIds: z.array(z.string().min(1)).default([]),
    knowledgeBaseIds: z.array(uuidSchema).default([])
  })
  .strict();
export type CreateAgentDefinition = z.infer<typeof createAgentDefinitionSchema>;

export const updateAgentDefinitionSchema = createAgentDefinitionSchema
  .partial()
  .refine((input) => Object.keys(input).length > 0, {
    message: "At least one field must be provided."
  });
export type UpdateAgentDefinition = z.infer<typeof updateAgentDefinitionSchema>;

export const agentDefinitionSchema = createAgentDefinitionSchema.extend({
  id: uuidSchema,
  description: z.string().nullable(),
  templateKey: agentTemplateKeySchema.nullable(),
  templateSetup: z.array(agentTemplateRequirementSchema),
  maxTokens: z.number().int().positive().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime()
});
export type AgentDefinition = z.infer<typeof agentDefinitionSchema>;

export const agentDefinitionListSchema = z.object({
  data: z.array(agentDefinitionSchema),
  page: z.object({
    cursor: z.null(),
    nextCursor: z.null(),
    limit: z.number().int().min(1).max(100)
  })
});
export type AgentDefinitionList = z.infer<typeof agentDefinitionListSchema>;
