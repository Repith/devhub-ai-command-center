import { Controller, Get, Inject, UseGuards } from "@nestjs/common";

import type { IntegrationsStatusResponse } from "@devhub/contracts";

import { AuthGuard } from "../auth/auth.guard";
import type { RequestPrincipal } from "../auth/auth.types";
import { CurrentUser } from "../auth/current-user.decorator";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { IntegrationsService } from "./integrations.service";

@Controller("integrations")
@UseGuards(AuthGuard, RolesGuard)
export class IntegrationsController {
  public constructor(
    @Inject(IntegrationsService)
    private readonly integrations: IntegrationsService
  ) {}

  @Get()
  @Roles("OWNER", "ADMIN", "MEMBER")
  public list(
    @CurrentUser() principal: RequestPrincipal
  ): Promise<IntegrationsStatusResponse> {
    return this.integrations.list(principal);
  }
}
