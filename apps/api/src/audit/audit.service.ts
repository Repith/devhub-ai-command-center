import { Inject, Injectable } from "@nestjs/common";

import type { AuditLogList } from "@devhub/contracts";
import type { PrismaAuditLogRepository } from "@devhub/database";
import type { TenantContext } from "@devhub/domain";

import type { RequestPrincipal } from "../auth/auth.types";
import { AUDIT_LOG_REPOSITORY } from "./audit.tokens";

export interface AuditRecordInput {
  action: string;
  resourceType: string;
  resourceId?: string | null;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class AuditService {
  public constructor(
    @Inject(AUDIT_LOG_REPOSITORY)
    private readonly auditLogs: PrismaAuditLogRepository
  ) {}

  public async list(principal: RequestPrincipal): Promise<AuditLogList> {
    const records = await this.auditLogs.list(this.context(principal));
    return {
      data: records.map((record) => this.auditLogs.toResponse(record)),
      page: { cursor: null, nextCursor: null, limit: 100 }
    };
  }

  public async record(
    principal: RequestPrincipal,
    input: AuditRecordInput
  ): Promise<void> {
    await this.auditLogs.record(this.context(principal), input);
  }

  private context(principal: RequestPrincipal): TenantContext {
    return {
      tenantId: principal.tenantId,
      userId: principal.userId,
      correlationId: principal.sessionId
    };
  }
}
