import { z } from "zod";

import { uuidSchema } from "./api.js";
import { agentTemplateKeySchema } from "./agents.js";

export const usagePeriodSchema = z.enum(["24h", "7d", "30d", "all"]);
export type UsagePeriod = z.infer<typeof usagePeriodSchema>;

export const usageSummaryQuerySchema = z
  .object({
    period: usagePeriodSchema.default("30d")
  })
  .strict();
export type UsageSummaryQuery = z.infer<typeof usageSummaryQuerySchema>;

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
  agentId: uuidSchema,
  templateKey: agentTemplateKeySchema.nullable(),
  workflowVersion: z.number().int().positive().nullable(),
  toolCallsUsed: z.number().int().nonnegative(),
  retrievalHit: z.boolean(),
  retrievalHitCount: z.number().int().nonnegative(),
  finalAnswerTokens: z.number().int().nonnegative(),
  modelLatencyMs: z.number().int().nonnegative(),
  status: z.string().min(1),
  startedAt: z.iso.datetime().nullable(),
  completedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime()
});
export type UsageByRun = z.infer<typeof usageByRunSchema>;

export const usageByProviderModelSchema = usageTotalsSchema.extend({
  provider: z.string().min(1),
  model: z.string().min(1)
});
export type UsageByProviderModel = z.infer<typeof usageByProviderModelSchema>;

export const usagePeriodBucketSchema = usageTotalsSchema.extend({
  periodStart: z.iso.datetime(),
  periodEnd: z.iso.datetime()
});
export type UsagePeriodBucket = z.infer<typeof usagePeriodBucketSchema>;

export const usageBudgetWarningSchema = z
  .object({
    runId: uuidSchema,
    agentId: uuidSchema,
    level: z.enum(["NEAR_BUDGET", "OVER_BUDGET"]),
    maxTokens: z.number().int().positive(),
    totalTokens: z.number().int().nonnegative(),
    percentUsed: z.number().nonnegative(),
    createdAt: z.iso.datetime()
  })
  .strict();
export type UsageBudgetWarning = z.infer<typeof usageBudgetWarningSchema>;

export const usageSummarySchema = z.object({
  period: usagePeriodSchema,
  generatedAt: z.iso.datetime(),
  tenant: usageTotalsSchema,
  periods: z.array(usagePeriodBucketSchema),
  agents: z.array(usageByAgentSchema),
  runs: z.array(usageByRunSchema),
  providerModels: z.array(usageByProviderModelSchema),
  recentExpensiveRuns: z.array(usageByRunSchema),
  budgetWarnings: z.array(usageBudgetWarningSchema)
});
export type UsageSummary = z.infer<typeof usageSummarySchema>;

export const usageSummaryToolInputSchema = usageSummaryQuerySchema;
export type UsageSummaryToolInput = z.infer<typeof usageSummaryToolInputSchema>;

export const usageSummaryToolOutputSchema = usageSummarySchema;
export type UsageSummaryToolOutput = z.infer<
  typeof usageSummaryToolOutputSchema
>;
