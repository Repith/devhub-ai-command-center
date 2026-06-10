import { z } from "zod";

import { uuidSchema } from "./api.js";

export const usageTotalsSchema = z.object({
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
  costMicros: z.number().int().nonnegative(),
  latencyMs: z.number().int().nonnegative(),
  retryCount: z.number().int().nonnegative()
});
export type UsageTotals = z.infer<typeof usageTotalsSchema>;

export const usageByAgentSchema = usageTotalsSchema.extend({
  agentId: uuidSchema
});
export type UsageByAgent = z.infer<typeof usageByAgentSchema>;

export const usageByRunSchema = usageTotalsSchema.extend({
  runId: uuidSchema,
  agentId: uuidSchema
});
export type UsageByRun = z.infer<typeof usageByRunSchema>;

export const usageSummarySchema = z.object({
  tenant: usageTotalsSchema,
  agents: z.array(usageByAgentSchema),
  runs: z.array(usageByRunSchema)
});
export type UsageSummary = z.infer<typeof usageSummarySchema>;
