import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";

import type { DatabaseClient } from "@devhub/database";

import { DATABASE_CLIENT } from "../database/database.module";
import { TOKEN_SERVICE } from "./auth.tokens";
import type { RequestPrincipal } from "./auth.types";
import type { TokenService } from "./token.service";

@Injectable()
export class AuthPrincipalService {
  public constructor(
    @Inject(TOKEN_SERVICE) private readonly tokens: TokenService,
    @Inject(DATABASE_CLIENT) private readonly database: DatabaseClient
  ) {}

  public async resolveAccessToken(token: string): Promise<RequestPrincipal> {
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

    return {
      userId: session.userId,
      email: session.user.email,
      displayName: session.user.displayName,
      tenantId: session.tenantId,
      tenantName: session.tenant.name,
      tenantSlug: session.tenant.slug,
      role: session.membership.role,
      sessionId: session.id
    };
  }
}
