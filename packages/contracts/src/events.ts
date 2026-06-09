import { z } from "zod";

import { correlationIdSchema, uuidSchema } from "./api.js";
import { agentRunStatusSchema, runStepStatusSchema } from "./statuses.js";

const eventMetadataSchema = z.object({
  version: z.literal(1),
  eventId: uuidSchema,
  occurredAt: z.iso.datetime(),
  correlationId: correlationIdSchema,
  tenantId: uuidSchema
});

export const realtimeEventSchema = z.discriminatedUnion("type", [
  eventMetadataSchema.extend({
    type: z.literal("agent_run.status_changed"),
    payload: z.object({
      runId: uuidSchema,
      status: agentRunStatusSchema
    })
  }),
  eventMetadataSchema.extend({
    type: z.literal("agent_run.step_changed"),
    payload: z.object({
      runId: uuidSchema,
      stepId: uuidSchema,
      status: runStepStatusSchema
    })
  })
]);
export type RealtimeEvent = z.infer<typeof realtimeEventSchema>;
