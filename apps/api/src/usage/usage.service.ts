import { Inject, Injectable } from "@nestjs/common";

import type { UsageSummary } from "@devhub/contracts";
import type { PrismaUsageRepository } from "@devhub/database";
import type { TenantContext } from "@devhub/domain";

import type { RequestPrincipal } from "../auth/auth.types";
import { USAGE_REPOSITORY } from "./usage.tokens";

@Injectable()
export class UsageService {
  public constructor(
    @Inject(USAGE_REPOSITORY)
    private readonly usage: PrismaUsageRepository
  ) {}

  public summarize(principal: RequestPrincipal): Promise<UsageSummary> {
    return this.usage.summarize(this.context(principal));
  }

  private context(principal: RequestPrincipal): TenantContext {
    return {
      tenantId: principal.tenantId,
      userId: principal.userId,
      correlationId: principal.sessionId
    };
  }
}
