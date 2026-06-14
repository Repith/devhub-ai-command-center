import { Controller, Get, Inject, Query, UseGuards } from "@nestjs/common";

import {
  usageSummaryQuerySchema,
  type UsageSummary,
  type UsageSummaryQuery
} from "@devhub/contracts";

import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import type { RequestPrincipal } from "../auth/auth.types";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
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
    @CurrentUser() principal: RequestPrincipal,
    @Query(new ZodValidationPipe(usageSummaryQuerySchema))
    query: UsageSummaryQuery
  ): Promise<UsageSummary> {
    return this.usage.summarize(principal, query);
  }
}
