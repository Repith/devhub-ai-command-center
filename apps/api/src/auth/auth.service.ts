import { randomBytes, randomUUID } from "node:crypto";

import {
  ConflictException,
  Inject,
  Injectable,
  UnauthorizedException
} from "@nestjs/common";

import type {
  AccessTokenResponse,
  LoginInput,
  MembershipRole,
  RegisterInput
} from "@devhub/contracts";
import { DEFAULT_AGENT_TEMPLATES } from "@devhub/contracts";
import type { DatabaseClient } from "@devhub/database";

import { DATABASE_CLIENT } from "../database/database.module";
import { PASSWORD_SERVICE, TOKEN_SERVICE } from "./auth.tokens";
import type { PasswordService } from "./password.service";
import type { RefreshTokenMaterial, TokenService } from "./token.service";

interface AuthResult extends AccessTokenResponse {
  refreshToken: string;
}

interface SessionPrincipal {
  userId: string;
  tenantId: string;
  role: MembershipRole;
}

interface ErrorWithCode {
  code?: string;
}

@Injectable()
export class AuthService {
  private readonly dummyPasswordHash: Promise<string>;

  public constructor(
    @Inject(DATABASE_CLIENT) private readonly database: DatabaseClient,
    @Inject(PASSWORD_SERVICE) private readonly passwords: PasswordService,
    @Inject(TOKEN_SERVICE) private readonly tokens: TokenService
  ) {
    this.dummyPasswordHash = passwords.hash(
      randomBytes(32).toString("base64url")
    );
  }

  public async register(input: RegisterInput): Promise<AuthResult> {
    const passwordHash = await this.passwords.hash(input.password);
    const tenantSlug =
      input.tenantSlug ?? this.createTenantSlug(input.tenantName);
    const refresh = this.tokens.createRefreshToken();

    try {
      const principal = await this.database.$transaction(async (database) => {
        const user = await database.user.create({
          data: {
            email: input.email,
            passwordHash,
            ...(input.displayName ? { displayName: input.displayName } : {})
          }
        });
        const tenant = await database.tenant.create({
          data: { name: input.tenantName, slug: tenantSlug }
        });
        const membership = await database.membership.create({
          data: { userId: user.id, tenantId: tenant.id, role: "OWNER" }
        });
        await database.agentDefinition.createMany({
          data: DEFAULT_AGENT_TEMPLATES.map((template) => ({
            tenantId: tenant.id,
            templateKey: template.key,
            name: template.definition.name,
            description: template.definition.description ?? null,
            provider: template.definition.provider,
            model: this.defaultChatModel(),
            systemPrompt: template.definition.systemPrompt,
            maxSteps: template.definition.maxSteps,
            maxToolCalls: template.definition.maxToolCalls,
            maxTokens: template.definition.maxTokens ?? null,
            timeoutMs: template.definition.timeoutMs,
            enabledToolIds: [...template.definition.enabledToolIds],
            knowledgeBaseIds: [...template.definition.knowledgeBaseIds]
          }))
        });
        await database.refreshSession.create({
          data: this.sessionData(refresh, user.id, tenant.id)
        });
        return {
          userId: user.id,
          tenantId: tenant.id,
          role: membership.role
        };
      });

      return this.authResult(principal, refresh);
    } catch (error: unknown) {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException("Email or tenant slug is already in use.");
      }
      throw error;
    }
  }

  public async login(input: LoginInput): Promise<AuthResult> {
    const membershipFilter = input.tenantSlug
      ? { tenant: { slug: input.tenantSlug } }
      : {};
    const user = await this.database.user.findUnique({
      where: { email: input.email },
      include: {
        memberships: {
          where: membershipFilter,
          orderBy: { createdAt: "asc" },
          take: 1
        }
      }
    });
    const passwordHash = user?.passwordHash ?? (await this.dummyPasswordHash);
    const passwordValid = await this.passwords.verify(
      passwordHash,
      input.password
    );
    const membership = user?.memberships[0];

    if (!user || !membership || !passwordValid) {
      throw new UnauthorizedException("Invalid credentials.");
    }

    const refresh = this.tokens.createRefreshToken();
    await this.database.refreshSession.create({
      data: this.sessionData(refresh, user.id, membership.tenantId)
    });
    return this.authResult(
      {
        userId: user.id,
        tenantId: membership.tenantId,
        role: membership.role
      },
      refresh
    );
  }

  public async refresh(token: string): Promise<AuthResult> {
    const sessionId = this.tokens.getSessionId(token);
    if (!sessionId) {
      throw new UnauthorizedException("Invalid refresh token.");
    }

    const session = await this.database.refreshSession.findUnique({
      where: { id: sessionId },
      include: { membership: true }
    });
    if (
      !session ||
      !this.tokens.matchesRefreshToken(token, session.tokenHash)
    ) {
      throw new UnauthorizedException("Invalid refresh token.");
    }
    if (session.revokedAt) {
      await this.revokeFamily(session.familyId);
      throw new UnauthorizedException("Refresh token reuse detected.");
    }
    if (session.expiresAt <= new Date()) {
      await this.database.refreshSession.update({
        where: { id: session.id },
        data: { revokedAt: new Date() }
      });
      throw new UnauthorizedException("Refresh token expired.");
    }

    const replacement = this.tokens.createRefreshToken(session.familyId);
    const principal = await this.database.$transaction(
      async (database): Promise<SessionPrincipal | null> => {
        const revoked = await database.refreshSession.updateMany({
          where: { id: session.id, revokedAt: null },
          data: {
            revokedAt: new Date(),
            replacedBySessionId: replacement.sessionId
          }
        });
        if (revoked.count !== 1) {
          await database.refreshSession.updateMany({
            where: { familyId: session.familyId, revokedAt: null },
            data: { revokedAt: new Date() }
          });
          return null;
        }

        await database.refreshSession.create({
          data: this.sessionData(replacement, session.userId, session.tenantId)
        });
        return {
          userId: session.userId,
          tenantId: session.tenantId,
          role: session.membership.role
        };
      },
      { isolationLevel: "Serializable" }
    );

    if (!principal) {
      throw new UnauthorizedException("Refresh token reuse detected.");
    }
    return this.authResult(principal, replacement);
  }

  public async logout(token: string | undefined): Promise<void> {
    if (!token) {
      return;
    }
    const sessionId = this.tokens.getSessionId(token);
    if (!sessionId) {
      return;
    }
    const session = await this.database.refreshSession.findUnique({
      where: { id: sessionId }
    });
    if (
      session &&
      this.tokens.matchesRefreshToken(token, session.tokenHash) &&
      !session.revokedAt
    ) {
      await this.database.refreshSession.update({
        where: { id: session.id },
        data: { revokedAt: new Date() }
      });
    }
  }

  private async authResult(
    principal: SessionPrincipal,
    refresh: RefreshTokenMaterial
  ): Promise<AuthResult> {
    const access = await this.tokens.issueAccessToken(
      principal.userId,
      principal.tenantId,
      principal.role,
      refresh.sessionId
    );
    return { ...access, refreshToken: refresh.token };
  }

  private sessionData(
    refresh: RefreshTokenMaterial,
    userId: string,
    tenantId: string
  ): {
    id: string;
    familyId: string;
    tokenHash: string;
    expiresAt: Date;
    userId: string;
    tenantId: string;
  } {
    return {
      id: refresh.sessionId,
      familyId: refresh.familyId,
      tokenHash: refresh.tokenHash,
      expiresAt: refresh.expiresAt,
      userId,
      tenantId
    };
  }

  private createTenantSlug(name: string): string {
    const base = name
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60);
    const prefix = base.length >= 3 ? base : "workspace";
    return `${prefix}-${randomUUID().slice(0, 8)}`;
  }

  private defaultChatModel(): string {
    return process.env.OLLAMA_CHAT_MODEL ?? "qwen3:8b";
  }

  private async revokeFamily(familyId: string): Promise<void> {
    await this.database.refreshSession.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() }
    });
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return (
      typeof error === "object" &&
      error !== null &&
      (error as ErrorWithCode).code === "P2002"
    );
  }
}
