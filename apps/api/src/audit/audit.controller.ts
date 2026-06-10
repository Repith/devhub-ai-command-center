import { Controller, Get, Inject, UseGuards } from "@nestjs/common";

import type { AuditLogList } from "@devhub/contracts";

import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import type { RequestPrincipal } from "../auth/auth.types";
import { AuditService } from "./audit.service";

@Controller("audit-log")
@UseGuards(AuthGuard, RolesGuard)
export class AuditController {
  public constructor(
    @Inject(AuditService) private readonly audit: AuditService
  ) {}

  @Get()
  @Roles("OWNER", "ADMIN")
  public list(
    @CurrentUser() principal: RequestPrincipal
  ): Promise<AuditLogList> {
    return this.audit.list(principal);
  }
}
