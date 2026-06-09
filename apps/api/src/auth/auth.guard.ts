import {
  Inject,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext
} from "@nestjs/common";
import type { Request } from "express";

import type { DatabaseClient } from "@devhub/database";

import { DATABASE_CLIENT } from "../database/database.module";
import { TOKEN_SERVICE } from "./auth.tokens";
import type { RequestPrincipal } from "./auth.types";
import type { TokenService } from "./token.service";

interface AuthenticatedRequest extends Request {
  principal?: RequestPrincipal;
}

@Injectable()
export class AuthGuard implements CanActivate {
  public constructor(
    @Inject(TOKEN_SERVICE) private readonly tokens: TokenService,
    @Inject(DATABASE_CLIENT) private readonly database: DatabaseClient
  ) {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractBearerToken(request);
    const claims = await this.tokens.verifyAccessToken(token);
    const session = await this.database.refreshSession.findFirst({
      where: {
        id: claims.sessionId,
        userId: claims.sub,
        tenantId: claims.tenantId,
        revokedAt: null,
        expiresAt: { gt: new Date() }
      },
      include: {
        user: true,
        tenant: true,
        membership: true
      }
    });

    if (!session) {
      throw new UnauthorizedException("Session is not active.");
    }

    request.principal = {
      userId: session.userId,
      email: session.user.email,
      displayName: session.user.displayName,
      tenantId: session.tenantId,
      tenantName: session.tenant.name,
      tenantSlug: session.tenant.slug,
      role: session.membership.role,
      sessionId: session.id
    };
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
