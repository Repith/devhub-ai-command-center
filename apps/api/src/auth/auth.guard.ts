import {
  Inject,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext
} from "@nestjs/common";
import type { Request } from "express";

import { AuthPrincipalService } from "./auth-principal.service";
import type { RequestPrincipal } from "./auth.types";

interface AuthenticatedRequest extends Request {
  principal?: RequestPrincipal;
}

@Injectable()
export class AuthGuard implements CanActivate {
  public constructor(
    @Inject(AuthPrincipalService)
    private readonly principals: AuthPrincipalService
  ) {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractBearerToken(request);
    request.principal = await this.principals.resolveAccessToken(token);
    return true;
  }

  private extractBearerToken(request: Request): string {
    const [scheme, token] = request.header("authorization")?.split(" ") ?? [];
    if (scheme !== "Bearer" || !token) {
      throw new UnauthorizedException("Bearer access token is required.");
    }
    return token;
  }
}
