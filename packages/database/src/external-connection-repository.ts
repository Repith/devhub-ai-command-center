import type { TenantContext } from "@devhub/domain";

import type { DatabaseClient } from "./client.js";

export type ExternalConnectionProvider = "GMAIL" | "GITHUB";
export type ExternalConnectionStatus = "CONNECTED" | "DISCONNECTED" | "EXPIRED";

export interface ExternalConnectionRecord {
  id: string;
  tenantId: string;
  userId: string;
  provider: ExternalConnectionProvider;
  accountEmail: string | null;
  scopes: readonly string[];
  encryptedAccessToken: string | null;
  encryptedRefreshToken: string | null;
  expiresAt: Date | null;
  status: ExternalConnectionStatus;
  createdAt: Date;
  updatedAt: Date;
}

export type GmailConnectionRecord = Omit<
  ExternalConnectionRecord,
  "provider"
> & {
  provider?: "GMAIL";
};

export interface UpsertExternalConnectionInput {
  provider: ExternalConnectionProvider;
  accountEmail: string | null;
  scopes: readonly string[];
  encryptedAccessToken: string | null;
  encryptedRefreshToken: string | null;
  expiresAt: Date | null;
  status: ExternalConnectionStatus;
}

export type UpsertGmailConnectionInput = Omit<
  UpsertExternalConnectionInput,
  "provider"
>;

export interface RefreshExternalAccessTokenInput {
  encryptedAccessToken: string;
  expiresAt: Date | null;
  status: "CONNECTED" | "EXPIRED";
}

export type RefreshGmailAccessTokenInput = RefreshExternalAccessTokenInput;

export class PrismaExternalConnectionRepository {
  public constructor(private readonly database: DatabaseClient) {}

  public find(
    context: TenantContext,
    provider: ExternalConnectionProvider
  ): Promise<ExternalConnectionRecord | null> {
    return this.database.externalConnection.findUnique({
      where: {
        tenantId_userId_provider: {
          tenantId: context.tenantId,
          userId: context.userId,
          provider
        }
      }
    });
  }

  public upsert(
    context: TenantContext,
    input: UpsertExternalConnectionInput
  ): Promise<ExternalConnectionRecord> {
    return this.database.externalConnection.upsert({
      where: {
        tenantId_userId_provider: {
          tenantId: context.tenantId,
          userId: context.userId,
          provider: input.provider
        }
      },
      update: {
        accountEmail: input.accountEmail,
        scopes: [...input.scopes],
        encryptedAccessToken: input.encryptedAccessToken,
        encryptedRefreshToken: input.encryptedRefreshToken,
        expiresAt: input.expiresAt,
        status: input.status
      },
      create: {
        tenantId: context.tenantId,
        userId: context.userId,
        provider: input.provider,
        accountEmail: input.accountEmail,
        scopes: [...input.scopes],
        encryptedAccessToken: input.encryptedAccessToken,
        encryptedRefreshToken: input.encryptedRefreshToken,
        expiresAt: input.expiresAt,
        status: input.status
      }
    });
  }

  public updateAccessToken(
    context: TenantContext,
    provider: ExternalConnectionProvider,
    input: RefreshExternalAccessTokenInput
  ): Promise<ExternalConnectionRecord> {
    return this.database.externalConnection.update({
      where: {
        tenantId_userId_provider: {
          tenantId: context.tenantId,
          userId: context.userId,
          provider
        }
      },
      data: {
        encryptedAccessToken: input.encryptedAccessToken,
        expiresAt: input.expiresAt,
        status: input.status
      }
    });
  }

  public disconnect(
    context: TenantContext,
    provider: ExternalConnectionProvider
  ): Promise<ExternalConnectionRecord> {
    return this.database.externalConnection.upsert({
      where: {
        tenantId_userId_provider: {
          tenantId: context.tenantId,
          userId: context.userId,
          provider
        }
      },
      update: {
        encryptedAccessToken: null,
        encryptedRefreshToken: null,
        expiresAt: null,
        status: "DISCONNECTED"
      },
      create: {
        tenantId: context.tenantId,
        userId: context.userId,
        provider,
        accountEmail: null,
        scopes: [],
        encryptedAccessToken: null,
        encryptedRefreshToken: null,
        expiresAt: null,
        status: "DISCONNECTED"
      }
    });
  }

  public findGmail(
    context: TenantContext
  ): Promise<GmailConnectionRecord | null> {
    return this.find(context, "GMAIL") as Promise<GmailConnectionRecord | null>;
  }

  public upsertGmail(
    context: TenantContext,
    input: UpsertGmailConnectionInput
  ): Promise<GmailConnectionRecord> {
    return this.upsert(context, {
      provider: "GMAIL",
      ...input
    }) as Promise<GmailConnectionRecord>;
  }

  public updateGmailAccessToken(
    context: TenantContext,
    input: RefreshGmailAccessTokenInput
  ): Promise<GmailConnectionRecord> {
    return this.updateAccessToken(
      context,
      "GMAIL",
      input
    ) as Promise<GmailConnectionRecord>;
  }
}
