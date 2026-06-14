import { z } from "zod";

import { uuidSchema } from "./api.js";
import { evaluationStatusSchema } from "./statuses.js";

export const evaluationModeSchema = z.enum([
  "FAST_LLM_ONLY",
  "FULL_AGENT_RUNTIME"
]);
export type EvaluationMode = z.infer<typeof evaluationModeSchema>;

export const createGoldenCaseSchema = z
  .object({
    agentId: uuidSchema,
    name: z.string().trim().min(1).max(160),
    input: z.string().trim().min(1).max(20_000),
    expectedFacts: z
      .array(z.string().trim().min(1).max(500))
      .max(25)
      .default([]),
    forbiddenClaims: z
      .array(z.string().trim().min(1).max(500))
      .max(25)
      .default([]),
    expectedSources: z
      .array(z.string().trim().min(1).max(500))
      .max(25)
      .default([])
  })
  .strict();
export type CreateGoldenCase = z.infer<typeof createGoldenCaseSchema>;

export const updateGoldenCaseSchema = createGoldenCaseSchema
  .omit({ agentId: true })
  .partial()
  .refine((input) => Object.keys(input).length > 0, {
    message: "At least one field must be provided."
  });
export type UpdateGoldenCase = z.infer<typeof updateGoldenCaseSchema>;

export const goldenCaseSchema = createGoldenCaseSchema.extend({
  id: uuidSchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime()
});
export type GoldenCase = z.infer<typeof goldenCaseSchema>;

export const goldenCaseListSchema = z.object({
  data: z.array(goldenCaseSchema),
  page: z.object({
    cursor: z.null(),
    nextCursor: z.null(),
    limit: z.number().int().min(1).max(1000)
  })
});
export type GoldenCaseList = z.infer<typeof goldenCaseListSchema>;

export const startGoldenEvaluationSchema = z
  .object({
    mode: evaluationModeSchema.default("FAST_LLM_ONLY")
  })
  .strict();
export type StartGoldenEvaluation = z.infer<typeof startGoldenEvaluationSchema>;

export const evaluationRunSchema = z.object({
  id: uuidSchema,
  status: evaluationStatusSchema,
  mode: evaluationModeSchema,
  configVersion: z.string().min(1),
  startedAt: z.iso.datetime().nullable(),
  completedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime()
});
export type EvaluationRun = z.infer<typeof evaluationRunSchema>;

export const evaluationRunListSchema = z.object({
  data: z.array(evaluationRunSchema),
  page: z.object({
    cursor: z.null(),
    nextCursor: z.null(),
    limit: z.number().int().min(1).max(100)
  })
});
export type EvaluationRunList = z.infer<typeof evaluationRunListSchema>;

export const evaluationResultDetailsSchema = z.object({
  answerPreview: z.string(),
  expectedFacts: z.array(z.object({ value: z.string(), matched: z.boolean() })),
  forbiddenClaims: z.array(
    z.object({ value: z.string(), matched: z.boolean() })
  ),
  expectedSources: z.array(
    z.object({ value: z.string(), matched: z.boolean() })
  )
});
export type EvaluationResultDetails = z.infer<
  typeof evaluationResultDetailsSchema
>;

export const evaluationResultSchema = z.object({
  id: uuidSchema,
  evaluationRunId: uuidSchema,
  goldenCaseId: uuidSchema,
  mode: evaluationModeSchema,
  agentRunId: uuidSchema.nullable(),
  passed: z.boolean(),
  score: z.number().min(0).max(1),
  details: evaluationResultDetailsSchema,
  latencyMs: z.number().int().nonnegative(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  retrievalHit: z.boolean(),
  toolCallsUsed: z.number().int().nonnegative(),
  terminalStatus: z.string().nullable(),
  errorCode: z.string().nullable(),
  errorMessagePreview: z.string().nullable(),
  workflowVersion: z.string().nullable(),
  createdAt: z.iso.datetime()
});
export type EvaluationResult = z.infer<typeof evaluationResultSchema>;

export const evaluationReportSchema = z.object({
  run: evaluationRunSchema,
  results: z.array(evaluationResultSchema)
});
export type EvaluationReport = z.infer<typeof evaluationReportSchema>;

export const goldenEvaluationJobSchema = z
  .object({
    version: z.literal(1),
    tenantId: uuidSchema,
    userId: uuidSchema,
    correlationId: z.string().min(1),
    evaluationRunId: uuidSchema,
    mode: evaluationModeSchema.default("FAST_LLM_ONLY")
  })
  .strict();
export type GoldenEvaluationJob = z.infer<typeof goldenEvaluationJobSchema>;
