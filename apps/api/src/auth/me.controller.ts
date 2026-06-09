import { Controller, Get, UseGuards } from "@nestjs/common";

import type { AuthenticatedUser } from "@devhub/contracts";

import { AuthGuard } from "./auth.guard";
import { CurrentUser } from "./current-user.decorator";
import { Roles } from "./roles.decorator";
import { RolesGuard } from "./roles.guard";
import type { RequestPrincipal } from "./auth.types";

@Controller("me")
export class MeController {
  @Get()
  @Roles("OWNER", "ADMIN", "MEMBER")
  @UseGuards(AuthGuard, RolesGuard)
  public getMe(@CurrentUser() principal: RequestPrincipal): AuthenticatedUser {
    return {
      userId: principal.userId,
      email: principal.email,
      displayName: principal.displayName,
      tenantId: principal.tenantId,
      tenantName: principal.tenantName,
      tenantSlug: principal.tenantSlug,
      role: principal.role
    };
  }
}
