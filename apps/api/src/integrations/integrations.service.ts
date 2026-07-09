import { Inject, Injectable } from "@nestjs/common";

import type {
  ExternalConnectionStatusResponse,
  IntegrationProvider,
  IntegrationStatus,
  IntegrationsStatusResponse
} from "@devhub/contracts";
import type {
  ExternalConnectionRecord,
  PrismaExternalConnectionRepository
} from "@devhub/database";
import type { TenantContext } from "@devhub/domain";

import type { RequestPrincipal } from "../auth/auth.types";
import {
  canUseGmailDevMock,
  isGmailConfigured,
  loadGmailConfig,
  missingGmailConfigKeys
} from "../gmail/gmail.config";
import {
  isGithubConfigured,
  loadGithubConfig,
  missingGithubConfigKeys
} from "../github/github.config";
import { INTEGRATIONS_CONNECTION_REPOSITORY } from "./integrations.tokens";

@Injectable()
export class IntegrationsService {
  public constructor(
    @Inject(INTEGRATIONS_CONNECTION_REPOSITORY)
    private readonly connections: PrismaExternalConnectionRepository
  ) {}

  public async list(
    principal: RequestPrincipal
  ): Promise<IntegrationsStatusResponse> {
    const context = this.context(principal);
    const [gmailConnection, githubConnection] = await Promise.all([
      this.connections.find(context, "GMAIL"),
      this.connections.find(context, "GITHUB")
    ]);
    return {
      data: [gmailStatus(gmailConnection), githubStatus(githubConnection)]
    };
  }

  private context(principal: RequestPrincipal): TenantContext {
    return {
      tenantId: principal.tenantId,
      userId: principal.userId,
      correlationId: principal.sessionId
    };
  }
}

function gmailStatus(
  connection: ExternalConnectionRecord | null
): ExternalConnectionStatusResponse {
  const config = loadGmailConfig();
  const missingConfigKeys = missingGmailConfigKeys(config);
  const configured = isGmailConfigured(config) || canUseGmailDevMock(config);
  return connectionStatus({
    provider: "GMAIL",
    connection,
    missingConfigKeys,
    status: configured ? connectionState(connection) : "MISCONFIGURED"
  });
}

function githubStatus(
  connection: ExternalConnectionRecord | null
): ExternalConnectionStatusResponse {
  const config = loadGithubConfig();
  const missingConfigKeys = missingGithubConfigKeys(config);
  return connectionStatus({
    provider: "GITHUB",
    connection,
    missingConfigKeys,
    status: isGithubConfigured(config)
      ? connectionState(connection)
      : "MISCONFIGURED"
  });
}

function connectionStatus(input: {
  provider: IntegrationProvider;
  connection: ExternalConnectionRecord | null;
  missingConfigKeys: readonly string[];
  status: IntegrationStatus;
}): ExternalConnectionStatusResponse {
  return {
    provider: input.provider,
    status: input.status,
    accountLabel: input.connection?.accountEmail ?? null,
    scopes: input.connection ? [...input.connection.scopes] : [],
    missingConfigKeys: [...input.missingConfigKeys],
    connectedAt: input.connection?.createdAt.toISOString() ?? null,
    updatedAt: input.connection?.updatedAt.toISOString() ?? null
  };
}

function connectionState(
  connection: ExternalConnectionRecord | null
): IntegrationStatus {
  if (!connection) {
    return "DISCONNECTED";
  }
  if (connection.expiresAt && connection.expiresAt.getTime() <= Date.now()) {
    return "EXPIRED";
  }
  return connection.status;
}
