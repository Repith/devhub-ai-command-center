import type { TenantContext } from "@devhub/domain";

import type { DatabaseClient } from "./client.js";

export interface GmailConnectionRecord {
  id: string;
  tenantId: string;
  userId: string;
  accountEmail: string | null;
  scopes: readonly string[];
  encryptedAccessToken: string | null;
  encryptedRefreshToken: string | null;
  expiresAt: Date | null;
  status: "CONNECTED" | "DISCONNECTED" | "EXPIRED";
  createdAt: Date;
  updatedAt: Date;
}

export interface UpsertGmailConnectionInput {
  accountEmail: string | null;
  scopes: readonly string[];
  encryptedAccessToken: string | null;
  encryptedRefreshToken: string | null;
  expiresAt: Date | null;
  status: "CONNECTED" | "DISCONNECTED" | "EXPIRED";
}

export interface RefreshGmailAccessTokenInput {
  encryptedAccessToken: string;
  expiresAt: Date | null;
  status: "CONNECTED" | "EXPIRED";
}

export class PrismaExternalConnectionRepository {
  public constructor(private readonly database: DatabaseClient) {}

  public findGmail(
    context: TenantContext
  ): Promise<GmailConnectionRecord | null> {
    return this.database.externalConnection.findUnique({
      where: {
        tenantId_userId_provider: {
          tenantId: context.tenantId,
          userId: context.userId,
          provider: "GMAIL"
        }
      }
    });
  }

  public upsertGmail(
    context: TenantContext,
    input: UpsertGmailConnectionInput
  ): Promise<GmailConnectionRecord> {
    return this.database.externalConnection.upsert({
      where: {
        tenantId_userId_provider: {
          tenantId: context.tenantId,
          userId: context.userId,
          provider: "GMAIL"
        }
      },
      update: {
        accountEmail: input.accountEmail,
        scopes: [...input.scopes],
        encryptedAccessToken: input.encryptedAccessToken,
        ...(input.encryptedRefreshToken
          ? { encryptedRefreshToken: input.encryptedRefreshToken }
          : {}),
        expiresAt: input.expiresAt,
        status: input.status
      },
      create: {
        tenantId: context.tenantId,
        userId: context.userId,
        provider: "GMAIL",
        accountEmail: input.accountEmail,
        scopes: [...input.scopes],
        encryptedAccessToken: input.encryptedAccessToken,
        encryptedRefreshToken: input.encryptedRefreshToken,
        expiresAt: input.expiresAt,
        status: input.status
      }
    });
  }

  public updateGmailAccessToken(
    context: TenantContext,
    input: RefreshGmailAccessTokenInput
  ): Promise<GmailConnectionRecord> {
    return this.database.externalConnection.update({
      where: {
        tenantId_userId_provider: {
          tenantId: context.tenantId,
          userId: context.userId,
          provider: "GMAIL"
        }
      },
      data: {
        encryptedAccessToken: input.encryptedAccessToken,
        expiresAt: input.expiresAt,
        status: input.status
      }
    });
  }
}
