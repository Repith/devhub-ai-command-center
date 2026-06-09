import { z } from "zod";

export const membershipRoleSchema = z.enum(["OWNER", "ADMIN", "MEMBER"]);
export type MembershipRole = z.infer<typeof membershipRoleSchema>;

export const documentStatusSchema = z.enum([
  "UPLOADED",
  "PROCESSING",
  "INDEXED",
  "FAILED",
  "DELETING"
]);
export type DocumentStatus = z.infer<typeof documentStatusSchema>;

export const agentRunStatusSchema = z.enum([
  "QUEUED",
  "RUNNING",
  "COMPLETED",
  "FAILED",
  "CANCEL_REQUESTED",
  "CANCELLED",
  "TIMED_OUT"
]);
export type AgentRunStatus = z.infer<typeof agentRunStatusSchema>;

export const runStepStatusSchema = z.enum([
  "PENDING",
  "RUNNING",
  "COMPLETED",
  "FAILED",
  "SKIPPED"
]);
export type RunStepStatus = z.infer<typeof runStepStatusSchema>;

export const evaluationStatusSchema = z.enum([
  "QUEUED",
  "RUNNING",
  "COMPLETED",
  "FAILED"
]);
export type EvaluationStatus = z.infer<typeof evaluationStatusSchema>;
