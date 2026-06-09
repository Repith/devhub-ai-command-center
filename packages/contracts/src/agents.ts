import { z } from "zod";

import { uuidSchema } from "./api.js";

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
