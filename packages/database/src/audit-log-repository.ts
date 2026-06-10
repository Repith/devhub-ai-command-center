import type { AuditLog } from "@devhub/contracts";
import type { TenantContext } from "@devhub/domain";

import type { DatabaseClient } from "./client.js";
import type { Prisma } from "./generated/prisma/client.js";

export interface AuditLogRecord {
  id: string;
  tenantId: string;
  userId: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  metadata: unknown;
  createdAt: Date;
}

export interface CreateAuditLogInput {
  action: string;
  resourceType: string;
  resourceId?: string | null;
  metadata?: Record<string, unknown>;
}

export class PrismaAuditLogRepository {
  public constructor(private readonly database: DatabaseClient) {}

  public async list(
    context: TenantContext
  ): Promise<readonly AuditLogRecord[]> {
    return this.database.auditLog.findMany({
      where: { tenantId: context.tenantId },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      take: 100
    });
  }

  public async record(
    context: TenantContext,
    input: CreateAuditLogInput
  ): Promise<void> {
    await this.database.auditLog.create({
      data: {
        tenantId: context.tenantId,
        userId: context.userId,
        action: input.action,
        resourceType: input.resourceType,
        resourceId: input.resourceId ?? null,
        metadata: (input.metadata ?? {}) as Prisma.InputJsonValue
      }
    });
  }

  public toResponse(record: AuditLogRecord): AuditLog {
    return {
      id: record.id,
      action: record.action,
      resourceType: record.resourceType,
      resourceId: record.resourceId,
      metadata: record.metadata as Record<string, unknown>,
      createdAt: record.createdAt.toISOString()
    };
  }
}
