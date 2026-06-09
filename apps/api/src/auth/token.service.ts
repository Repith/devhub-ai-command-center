import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual
} from "node:crypto";

import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import type { JwtService } from "@nestjs/jwt";

import type { AccessTokenResponse, MembershipRole } from "@devhub/contracts";

import { AUTH_CONFIG, type AuthConfig } from "./auth.config";
import { JWT_SERVICE } from "./auth.tokens";
import type { AccessTokenClaims } from "./auth.types";

export interface RefreshTokenMaterial {
  sessionId: string;
  familyId: string;
  token: string;
  tokenHash: string;
  expiresAt: Date;
}

@Injectable()
export class TokenService {
  public constructor(
    @Inject(JWT_SERVICE) private readonly jwt: JwtService,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig
  ) {}

  public async issueAccessToken(
    userId: string,
    tenantId: string,
    role: MembershipRole,
    sessionId: string
  ): Promise<AccessTokenResponse> {
    const claims: AccessTokenClaims = {
      sub: userId,
      tenantId,
      role,
      sessionId
    };
    const accessToken = await this.jwt.signAsync(claims, {
      secret: this.config.jwtSecret,
      algorithm: "HS256",
      issuer: this.config.issuer,
      audience: this.config.audience,
      expiresIn: this.config.accessTokenTtlSeconds
    });
    return { accessToken, expiresIn: this.config.accessTokenTtlSeconds };
  }

  public async verifyAccessToken(token: string): Promise<AccessTokenClaims> {
    try {
      return await this.jwt.verifyAsync<AccessTokenClaims>(token, {
        secret: this.config.jwtSecret,
        algorithms: ["HS256"],
        issuer: this.config.issuer,
        audience: this.config.audience
      });
    } catch {
      throw new UnauthorizedException("Invalid access token.");
    }
  }

  public createRefreshToken(
    familyId: string = randomUUID()
  ): RefreshTokenMaterial {
    const sessionId = randomUUID();
    const token = `${sessionId}.${randomBytes(48).toString("base64url")}`;
    return {
      sessionId,
      familyId,
      token,
      tokenHash: this.hashRefreshToken(token),
      expiresAt: new Date(
        Date.now() + this.config.refreshTokenTtlSeconds * 1000
      )
    };
  }

  public getSessionId(token: string): string | null {
    const [sessionId, secret, extra] = token.split(".");
    if (!sessionId || !secret || extra) {
      return null;
    }
    return /^[0-9a-f-]{36}$/i.test(sessionId) ? sessionId : null;
  }

  public matchesRefreshToken(token: string, expectedHash: string): boolean {
    const actual = Buffer.from(this.hashRefreshToken(token), "hex");
    const expected = Buffer.from(expectedHash, "hex");
    return (
      actual.length === expected.length && timingSafeEqual(actual, expected)
    );
  }

  private hashRefreshToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }
}
