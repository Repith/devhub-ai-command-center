import { z } from "zod";

import { uuidSchema } from "./api.js";

export const auditLogSchema = z.object({
  id: uuidSchema,
  action: z.string().min(1),
  resourceType: z.string().min(1),
  resourceId: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()),
  createdAt: z.iso.datetime()
});
export type AuditLog = z.infer<typeof auditLogSchema>;

export const auditLogListSchema = z.object({
  data: z.array(auditLogSchema),
  page: z.object({
    cursor: z.null(),
    nextCursor: z.null(),
    limit: z.number().int().min(1).max(100)
  })
});
export type AuditLogList = z.infer<typeof auditLogListSchema>;
