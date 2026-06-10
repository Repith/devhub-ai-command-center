import { z } from "zod";

import { uuidSchema } from "./api.js";
import { agentRunSnapshotSchema } from "./runs.js";

export const realtimeProbeRequestSchema = z
  .object({
    version: z.literal(1),
    requestId: uuidSchema,
    sentAt: z.iso.datetime()
  })
  .strict();
export type RealtimeProbeRequest = z.infer<typeof realtimeProbeRequestSchema>;

export const realtimeProbeAckSchema = z.discriminatedUnion("ok", [
  z.object({
    ok: z.literal(true),
    event: z.object({
      version: z.literal(1),
      type: z.literal("realtime.probe_ack"),
      requestId: uuidSchema,
      receivedAt: z.iso.datetime(),
      respondedAt: z.iso.datetime()
    })
  }),
  z.object({
    ok: z.literal(false),
    error: z.object({
      code: z.literal("INVALID_REALTIME_PROBE"),
      message: z.string().min(1)
    })
  })
]);
export type RealtimeProbeAck = z.infer<typeof realtimeProbeAckSchema>;

export const subscribeToRunRequestSchema = z
  .object({
    version: z.literal(1),
    runId: uuidSchema
  })
  .strict();
export type SubscribeToRunRequest = z.infer<typeof subscribeToRunRequestSchema>;

export const subscribeToRunAckSchema = z.discriminatedUnion("ok", [
  z.object({
    ok: z.literal(true),
    snapshot: agentRunSnapshotSchema
  }),
  z.object({
    ok: z.literal(false),
    error: z.object({
      code: z.enum(["INVALID_SUBSCRIPTION", "RUN_NOT_FOUND"]),
      message: z.string().min(1)
    })
  })
]);
export type SubscribeToRunAck = z.infer<typeof subscribeToRunAckSchema>;
