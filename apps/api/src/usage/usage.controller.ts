import { Controller, Get, Inject, UseGuards } from "@nestjs/common";

import type { UsageSummary } from "@devhub/contracts";

import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import type { RequestPrincipal } from "../auth/auth.types";
import { UsageService } from "./usage.service";

@Controller("usage")
@UseGuards(AuthGuard, RolesGuard)
export class UsageController {
  public constructor(
    @Inject(UsageService) private readonly usage: UsageService
  ) {}

  @Get()
  @Roles("OWNER", "ADMIN", "MEMBER")
  public summarize(
    @CurrentUser() principal: RequestPrincipal
  ): Promise<UsageSummary> {
    return this.usage.summarize(principal);
  }
}
