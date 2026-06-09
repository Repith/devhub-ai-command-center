import {
  ForbiddenException,
  Injectable,
  type CanActivate,
  type ExecutionContext
} from "@nestjs/common";
import { Inject } from "@nestjs/common";
import type { Reflector } from "@nestjs/core";
import type { Request } from "express";

import type { MembershipRole } from "@devhub/contracts";

import { AUTH_REFLECTOR } from "./auth.tokens";
import type { RequestPrincipal } from "./auth.types";
import { ROLES_METADATA } from "./roles.decorator";

interface AuthenticatedRequest extends Request {
  principal?: RequestPrincipal;
}

@Injectable()
export class RolesGuard implements CanActivate {
  public constructor(
    @Inject(AUTH_REFLECTOR) private readonly reflector: Reflector
  ) {}

  public canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<
      readonly MembershipRole[]
    >(ROLES_METADATA, [context.getHandler(), context.getClass()]);
    if (!required?.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.principal || !required.includes(request.principal.role)) {
      throw new ForbiddenException("The active role is not allowed.");
    }
    return true;
  }
}
