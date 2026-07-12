import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException
} from "@nestjs/common";

import type {
  CreateGmailDraftReview,
  GmailConnectResponse,
  GmailConnectionStatus,
  GmailDevConnectResponse,
  GmailDraftReview,
  GmailDraftReviewList,
  GmailOAuthCallback,
  UpdateGmailDraftReview
} from "@devhub/contracts";
import type {
  GmailConnectionRecord,
  GmailDraftReviewRecord,
  PrismaExternalConnectionRepository,
  PrismaGmailDraftReviewRepository
} from "@devhub/database";
import type { TenantContext } from "@devhub/domain";
import { GmailRestClient } from "@devhub/mcp";

import type { RequestPrincipal } from "../auth/auth.types";
import { AuditService } from "../audit/audit.service";
import {
  brokerConfigured,
  prepareBrokerOAuth,
  redeemBrokerGrant
} from "../integrations/oauth-broker.client";
import {
  canUseGmailDevMock,
  isGmailConfigured,
  loadGmailConfig,
  missingGmailConfigKeys,
  type GmailConfig
} from "./gmail.config";
import {
  EXTERNAL_CONNECTION_REPOSITORY,
  GMAIL_DRAFT_REVIEW_REPOSITORY
} from "./gmail.tokens";
import { GmailOAuthStateService } from "./oauth-state.service";
import { TokenCryptoService } from "./token-crypto.service";

const googleTokenUrl = "https://oauth2.googleapis.com/token";
const gmailProfileUrl =
  "https://gmail.googleapis.com/gmail/v1/users/me/profile";
const gmailDevMockAccountEmail = "devhub-gmail-mock@example.local";
const gmailDevMockScope = "devhub:gmail-dev-mock";

interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
}

interface GmailProfileResponse {
  emailAddress?: string;
}

@Injectable()
export class GmailService {
  private readonly config: GmailConfig = loadGmailConfig();

  public constructor(
    @Inject(EXTERNAL_CONNECTION_REPOSITORY)
    private readonly connections: PrismaExternalConnectionRepository,
    @Inject(GMAIL_DRAFT_REVIEW_REPOSITORY)
    private readonly draftReviews: PrismaGmailDraftReviewRepository,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(TokenCryptoService)
    private readonly tokenCrypto: TokenCryptoService,
    @Inject(GmailOAuthStateService)
    private readonly oauthState: GmailOAuthStateService
  ) {}

  public async status(
    principal: RequestPrincipal
  ): Promise<GmailConnectionStatus> {
    const connection = await this.connections.findGmail(
      this.context(principal)
    );
    if (!isGmailConfigured(this.config)) {
      if (canUseGmailDevMock(this.config) && connection) {
        return this.statusResponse("CONNECTED", connection);
      }
      if (canUseGmailDevMock(this.config)) {
        return this.statusResponse("DISCONNECTED", null);
      }
      return this.statusResponse("MISCONFIGURED", connection);
    }
    if (!connection) {
      return this.statusResponse("DISCONNECTED", null);
    }
    const expired = isExpired(connection);
    return {
      status: expired ? "EXPIRED" : connection.status,
      accountEmail: connection.accountEmail,
      scopes: [...connection.scopes],
      missingConfigKeys: missingGmailConfigKeys(this.config),
      connectedAt: connection.createdAt.toISOString(),
      updatedAt: connection.updatedAt.toISOString(),
      requiredScopes: [...this.config.requiredScopes],
      autoSendAllowed: this.config.autoSendAllowed
    };
  }

  public connect(principal: RequestPrincipal): GmailConnectResponse {
    this.requireOAuthConfigured();
    const secret = this.stateSecret();
    const state = this.oauthState.sign(
      secret,
      principal.tenantId,
      principal.userId
    );
    if (brokerConfigured()) {
      return {
        authorizationUrl: prepareBrokerOAuth(
          "gmail",
          state,
          process.env.GMAIL_REDIRECT_URI ??
            "http://localhost:3000/gmail/oauth/callback"
        ),
        requiredScopes: [...this.config.requiredScopes]
      };
    }
    const authorizationUrl = new URL(
      "https://accounts.google.com/o/oauth2/v2/auth"
    );
    authorizationUrl.search = new URLSearchParams({
      client_id: this.config.clientId!,
      redirect_uri: this.config.redirectUri!,
      response_type: "code",
      access_type: "offline",
      include_granted_scopes: "true",
      prompt: "consent",
      scope: this.config.requiredScopes.join(" "),
      state
    }).toString();
    return {
      authorizationUrl: authorizationUrl.toString(),
      requiredScopes: [...this.config.requiredScopes]
    };
  }

  public async connectDevMock(
    principal: RequestPrincipal
  ): Promise<GmailDevConnectResponse> {
    if (!canUseGmailDevMock(this.config)) {
      throw gmailMisconfigured(
        "Gmail development mock is not configured.",
        this.config
      );
    }
    const context = this.context(principal);
    await this.connections.upsertGmail(context, {
      accountEmail: gmailDevMockAccountEmail,
      scopes: [...this.config.requiredScopes, gmailDevMockScope],
      encryptedAccessToken: this.tokenCrypto.encrypt(
        this.config.tokenEncryptionKey!,
        "devhub-gmail-mock-access-token"
      ),
      encryptedRefreshToken: this.tokenCrypto.encrypt(
        this.config.tokenEncryptionKey!,
        "devhub-gmail-mock-refresh-token"
      ),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      status: "CONNECTED"
    });
    await this.audit.record(principal, {
      action: "gmail.dev_mock_connected",
      resourceType: "external_connection",
      metadata: { provider: "GMAIL", mode: "dev-mock" }
    });
    return this.status(principal);
  }

  public async disconnect(
    principal: RequestPrincipal
  ): Promise<GmailConnectionStatus> {
    await this.connections.disconnect(this.context(principal), "GMAIL");
    await this.audit.record(principal, {
      action: "gmail.disconnected",
      resourceType: "external_connection",
      metadata: { provider: "GMAIL" }
    });
    return this.status(principal);
  }

  public async completeOAuth(
    principal: RequestPrincipal,
    input: GmailOAuthCallback
  ): Promise<GmailConnectionStatus> {
    this.requireOAuthConfigured();
    this.verifyState(principal, input.state);
    const context = this.context(principal);
    const previous = await this.connections.findGmail(context);
    const grant = brokerConfigured()
      ? await redeemBrokerGrant(input.state, input.code)
      : null;
    const token = grant
      ? (grant.tokens as unknown as GoogleTokenResponse)
      : await this.exchangeCode(input.code);
    const profile = grant
      ? { emailAddress: grant.identity }
      : await this.fetchProfile(token.access_token);
    const encryptionKey =
      this.config.tokenEncryptionKey ?? process.env.JWT_SECRET!;
    const refreshToken =
      token.refresh_token ??
      (previous?.encryptedRefreshToken
        ? this.tokenCrypto.decrypt(
            encryptionKey,
            previous.encryptedRefreshToken
          )
        : null);
    if (!refreshToken) {
      throw new BadRequestException({
        code: "GMAIL_REFRESH_TOKEN_MISSING",
        message: "Google did not return a refresh token."
      });
    }
    await this.connections.upsertGmail(context, {
      accountEmail: profile.emailAddress ?? null,
      scopes: parseScopes(token.scope),
      encryptedAccessToken: this.tokenCrypto.encrypt(
        encryptionKey,
        token.access_token
      ),
      encryptedRefreshToken: this.tokenCrypto.encrypt(
        encryptionKey,
        refreshToken
      ),
      expiresAt: expiresAt(token.expires_in),
      status: "CONNECTED"
    });
    await this.audit.record(principal, {
      action: "gmail.connected",
      resourceType: "external_connection",
      metadata: {
        provider: "GMAIL",
        accountEmail: profile.emailAddress ?? null,
        scopes: parseScopes(token.scope)
      }
    });
    return this.status(principal);
  }

  public async listDraftReviews(
    principal: RequestPrincipal
  ): Promise<GmailDraftReviewList> {
    const records = await this.draftReviews.list(this.context(principal));
    return {
      data: records.map(toDraftReview),
      page: { cursor: null, nextCursor: null, limit: 100 }
    };
  }

  public async createDraftReview(
    principal: RequestPrincipal,
    input: CreateGmailDraftReview
  ): Promise<GmailDraftReview> {
    const record = await this.draftReviews.createUserReview(
      this.context(principal),
      input
    );
    await this.auditDraft(principal, "gmail.draft_review.created", record);
    return toDraftReview(record);
  }

  public async updateDraftReview(
    principal: RequestPrincipal,
    reviewId: string,
    input: UpdateGmailDraftReview
  ): Promise<GmailDraftReview> {
    const record = await this.draftReviews.update(
      this.context(principal),
      reviewId,
      input
    );
    if (!record) {
      throw new NotFoundException("Gmail draft review was not found.");
    }
    await this.auditDraft(principal, "gmail.draft_review.updated", record);
    return toDraftReview(record);
  }

  public async rejectDraftReview(
    principal: RequestPrincipal,
    reviewId: string
  ): Promise<GmailDraftReview> {
    const record = await this.draftReviews.reject(
      this.context(principal),
      reviewId
    );
    if (!record) {
      throw new NotFoundException("Gmail draft review was not found.");
    }
    await this.auditDraft(principal, "gmail.draft_review.rejected", record);
    return toDraftReview(record);
  }

  public async sendDraftReview(
    principal: RequestPrincipal,
    reviewId: string
  ): Promise<GmailDraftReview> {
    this.requireConfigured();
    const context = this.context(principal);
    const record = await this.draftReviews.findById(context, reviewId);
    if (!record || !["NEEDS_REVIEW", "UPDATED"].includes(record.status)) {
      throw new NotFoundException("Gmail draft review was not found.");
    }
    const connection = await this.connections.findGmail(context);
    if (connection && isDevMockConnection(connection)) {
      const sentRecord = await this.draftReviews.markSent(context, reviewId, {
        gmailDraftId: record.gmailDraftId ?? `mock-draft-${record.id}`,
        threadId: record.threadId
      });
      if (!sentRecord) {
        throw new NotFoundException("Gmail draft review was not found.");
      }
      await this.auditDraft(principal, "gmail.draft_review.sent", sentRecord);
      return toDraftReview(sentRecord);
    }
    const accessToken = await this.accessToken(context);
    const client = new GmailRestClient({ accessToken });
    const input = {
      ...(record.threadId ? { threadId: record.threadId } : {}),
      to: record.to,
      cc: record.cc,
      subject: record.subject,
      body: record.body
    };
    const draft = record.gmailDraftId
      ? await client.updateDraft(record.gmailDraftId, input)
      : await client.createDraft(input);
    const sent = await client.sendDraft(draft.draftId);
    const sentRecord = await this.draftReviews.markSent(context, reviewId, {
      gmailDraftId: sent.draftId,
      threadId: sent.threadId ?? record.threadId
    });
    if (!sentRecord) {
      throw new NotFoundException("Gmail draft review was not found.");
    }
    await this.auditDraft(principal, "gmail.draft_review.sent", sentRecord);
    return toDraftReview(sentRecord);
  }

  private async accessToken(context: TenantContext): Promise<string> {
    const connection = await this.connections.findGmail(context);
    if (!connection?.encryptedRefreshToken) {
      throw new BadRequestException("Gmail is not connected.");
    }
    if (
      connection.encryptedAccessToken &&
      connection.expiresAt &&
      connection.expiresAt.getTime() > Date.now() + 60_000
    ) {
      return this.tokenCrypto.decrypt(
        this.config.tokenEncryptionKey!,
        connection.encryptedAccessToken
      );
    }
    const refreshed = await this.refreshAccessToken(connection);
    return refreshed.access_token;
  }

  private async refreshAccessToken(
    connection: GmailConnectionRecord
  ): Promise<GoogleTokenResponse> {
    const refreshToken = this.tokenCrypto.decrypt(
      this.config.tokenEncryptionKey!,
      connection.encryptedRefreshToken!
    );
    const token = await this.tokenRequest({
      client_id: this.config.clientId!,
      client_secret: this.config.clientSecret!,
      grant_type: "refresh_token",
      refresh_token: refreshToken
    });
    await this.connections.updateGmailAccessToken(
      {
        tenantId: connection.tenantId,
        userId: connection.userId,
        correlationId: "gmail-refresh"
      },
      {
        encryptedAccessToken: this.tokenCrypto.encrypt(
          this.config.tokenEncryptionKey!,
          token.access_token
        ),
        expiresAt: expiresAt(token.expires_in),
        status: "CONNECTED"
      }
    );
    return token;
  }

  private exchangeCode(code: string): Promise<GoogleTokenResponse> {
    return this.tokenRequest({
      code,
      client_id: this.config.clientId!,
      client_secret: this.config.clientSecret!,
      redirect_uri: this.config.redirectUri!,
      grant_type: "authorization_code"
    });
  }

  private async tokenRequest(
    params: Record<string, string>
  ): Promise<GoogleTokenResponse> {
    const response = await fetch(googleTokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(params)
    });
    if (!response.ok) {
      throw new BadRequestException({
        code: "GMAIL_OAUTH_EXCHANGE_FAILED",
        message: "Google OAuth token exchange failed."
      });
    }
    return (await response.json()) as GoogleTokenResponse;
  }

  private async fetchProfile(
    accessToken: string
  ): Promise<GmailProfileResponse> {
    const response = await fetch(gmailProfileUrl, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!response.ok) {
      throw new BadRequestException({
        code: "GMAIL_PROFILE_LOOKUP_FAILED",
        message: "Gmail profile lookup failed."
      });
    }
    return (await response.json()) as GmailProfileResponse;
  }

  private requireConfigured(): void {
    if (!isGmailConfigured(this.config) && !canUseGmailDevMock(this.config)) {
      throw gmailMisconfigured("Gmail OAuth is not configured.", this.config);
    }
  }

  private requireOAuthConfigured(): void {
    if (!isGmailConfigured(this.config)) {
      throw gmailMisconfigured("Gmail OAuth is not configured.", this.config);
    }
  }

  private verifyState(principal: RequestPrincipal, state: string): void {
    try {
      this.oauthState.verify(
        this.stateSecret(),
        state,
        principal.tenantId,
        principal.userId
      );
    } catch {
      throw new BadRequestException({
        code: "OAUTH_STATE_INVALID",
        message: "Invalid Gmail OAuth state."
      });
    }
  }

  private stateSecret(): string {
    return process.env.JWT_SECRET ?? "local-gmail-oauth-state-secret";
  }

  private statusResponse(
    status: GmailConnectionStatus["status"],
    connection: GmailConnectionRecord | null
  ): GmailConnectionStatus {
    return {
      status,
      accountEmail: connection?.accountEmail ?? null,
      scopes: connection ? [...connection.scopes] : [],
      missingConfigKeys: missingGmailConfigKeys(this.config),
      connectedAt: connection?.createdAt.toISOString() ?? null,
      updatedAt: connection?.updatedAt.toISOString() ?? null,
      requiredScopes: [...this.config.requiredScopes],
      autoSendAllowed: this.config.autoSendAllowed
    };
  }

  private context(principal: RequestPrincipal): TenantContext {
    return {
      tenantId: principal.tenantId,
      userId: principal.userId,
      correlationId: principal.sessionId
    };
  }

  private async auditDraft(
    principal: RequestPrincipal,
    action: string,
    record: GmailDraftReviewRecord
  ): Promise<void> {
    await this.audit.record(principal, {
      action,
      resourceType: "gmail_draft_review",
      resourceId: record.id,
      metadata: {
        status: record.status,
        recipientCount: record.to.length,
        ccCount: record.cc.length,
        hasThread: Boolean(record.threadId)
      }
    });
  }
}

function toDraftReview(record: GmailDraftReviewRecord): GmailDraftReview {
  return {
    id: record.id,
    agentRunId: record.agentRunId,
    threadId: record.threadId,
    gmailDraftId: record.gmailDraftId,
    to: [...record.to],
    cc: [...record.cc],
    subject: record.subject,
    body: record.body,
    status: record.status,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    sentAt: record.sentAt?.toISOString() ?? null
  };
}

function parseScopes(value: string | undefined): string[] {
  return value?.split(/\s+/).filter(Boolean) ?? [];
}

function expiresAt(seconds: number | undefined): Date | null {
  return seconds ? new Date(Date.now() + seconds * 1000) : null;
}

function isExpired(connection: GmailConnectionRecord): boolean {
  return Boolean(
    connection.expiresAt && connection.expiresAt.getTime() <= Date.now()
  );
}

function isDevMockConnection(connection: GmailConnectionRecord): boolean {
  return (
    connection.accountEmail === gmailDevMockAccountEmail ||
    connection.scopes.includes(gmailDevMockScope)
  );
}

function gmailMisconfigured(
  message: string,
  config: GmailConfig
): ServiceUnavailableException {
  return new ServiceUnavailableException({
    code: "GMAIL_OAUTH_MISCONFIGURED",
    message,
    missingConfigKeys: missingGmailConfigKeys(config)
  });
}
