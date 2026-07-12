import { createHmac, timingSafeEqual } from "node:crypto";

import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException
} from "@nestjs/common";

import type {
  CreateGithubActionReview,
  GithubActionReview,
  GithubActionReviewList,
  GithubConnectResponse,
  GithubConnectionStatus,
  GithubOAuthCallback,
  GithubRepository,
  GithubRepositoryList,
  UpdateGithubActionReview
} from "@devhub/contracts";
import type {
  ExternalConnectionRecord,
  ExternalRepositoryRecord,
  PrismaExternalConnectionRepository,
  PrismaExternalInstallationRepository,
  PrismaGithubActionReviewRepository,
  GithubActionReviewRecord,
  SyncExternalInstallationInput
} from "@devhub/database";
import type { TenantContext } from "@devhub/domain";

import { AuditService } from "../audit/audit.service";
import {
  brokerConfigured,
  prepareBrokerOAuth,
  redeemBrokerGrant
} from "../integrations/oauth-broker.client";
import type { RequestPrincipal } from "../auth/auth.types";
import {
  isGithubConfigured,
  loadGithubConfig,
  missingGithubConfigKeys,
  type GithubConfig
} from "./github.config";
import {
  GITHUB_ACTION_REVIEW_REPOSITORY,
  GITHUB_CONNECTION_REPOSITORY,
  GITHUB_INSTALLATION_REPOSITORY
} from "./github.tokens";
import { GithubOAuthStateService } from "./oauth-state.service";
import { GithubTokenCryptoService } from "./token-crypto.service";

const githubAuthorizeUrl = "https://github.com/login/oauth/authorize";
const githubTokenUrl = "https://github.com/login/oauth/access_token";
const githubApiUrl = "https://api.github.com";

interface GithubTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
}

interface GithubUserResponse {
  login: string;
}

interface GithubInstallationResponse {
  id: number | string;
  account?: { login?: string; type?: string };
  target_type?: string;
  repository_selection?: string;
  permissions?: Record<string, string>;
}

interface GithubRepositoryResponse {
  id: number | string;
  name: string;
  full_name: string;
  private: boolean;
  default_branch?: string | null;
  html_url: string;
  owner?: { login?: string };
}

interface GithubActionResponse {
  html_url?: string;
}

@Injectable()
export class GithubService {
  private readonly config: GithubConfig = loadGithubConfig();

  public constructor(
    @Inject(GITHUB_CONNECTION_REPOSITORY)
    private readonly connections: PrismaExternalConnectionRepository,
    @Inject(GITHUB_INSTALLATION_REPOSITORY)
    private readonly installations: PrismaExternalInstallationRepository,
    @Inject(GITHUB_ACTION_REVIEW_REPOSITORY)
    private readonly actionReviews: PrismaGithubActionReviewRepository,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(GithubTokenCryptoService)
    private readonly tokenCrypto: GithubTokenCryptoService,
    @Inject(GithubOAuthStateService)
    private readonly oauthState: GithubOAuthStateService
  ) {}

  public async status(
    principal: RequestPrincipal
  ): Promise<GithubConnectionStatus> {
    const context = this.context(principal);
    const [connection, counts] = await Promise.all([
      this.connections.find(context, "GITHUB"),
      this.installations.countActive(context)
    ]);
    return this.statusResponse(connection, counts);
  }

  public connect(principal: RequestPrincipal): GithubConnectResponse {
    this.requireConfigured();
    const state = this.oauthState.sign(
      this.stateSecret(),
      principal.tenantId,
      principal.userId
    );
    if (brokerConfigured()) {
      return {
        authorizationUrl: prepareBrokerOAuth(
          "github",
          state,
          process.env.GITHUB_REDIRECT_URI ??
            "http://localhost:3000/github/oauth/callback"
        )
      };
    }
    const url = new URL(githubAuthorizeUrl);
    url.search = new URLSearchParams({
      client_id: this.config.clientId!,
      redirect_uri: this.config.redirectUri!,
      state
    }).toString();
    return { authorizationUrl: url.toString() };
  }

  public async completeOAuth(
    principal: RequestPrincipal,
    input: GithubOAuthCallback
  ): Promise<GithubConnectionStatus> {
    this.requireConfigured();
    this.verifyState(principal, input.state);
    const grant = brokerConfigured()
      ? await redeemBrokerGrant(input.state, input.code)
      : null;
    const token = grant
      ? (grant.tokens as unknown as GithubTokenResponse)
      : await this.exchangeCode(input.code);
    const user = grant
      ? { login: grant.identity }
      : await this.fetchUser(token.access_token);
    const encryptionKey =
      this.config.tokenEncryptionKey ?? process.env.JWT_SECRET!;
    await this.connections.upsert(this.context(principal), {
      provider: "GITHUB",
      accountEmail: user.login,
      scopes: parseScopes(token.scope),
      encryptedAccessToken: this.tokenCrypto.encrypt(
        encryptionKey,
        token.access_token
      ),
      encryptedRefreshToken: token.refresh_token
        ? this.tokenCrypto.encrypt(encryptionKey, token.refresh_token)
        : null,
      expiresAt: expiresAt(token.expires_in),
      status: "CONNECTED"
    });
    await this.audit.record(principal, {
      action: "github.connected",
      resourceType: "external_connection",
      metadata: { provider: "GITHUB", accountLogin: user.login }
    });
    return this.status(principal);
  }

  public async syncInstallations(
    principal: RequestPrincipal
  ): Promise<GithubConnectionStatus> {
    this.requireConfigured();
    const context = this.context(principal);
    const accessToken = await this.accessToken(context);
    const synced = await this.fetchInstallations(accessToken);
    const result = await this.installations.syncGithubInstallations(
      context,
      synced
    );
    await this.audit.record(principal, {
      action: "github.installations_synced",
      resourceType: "external_installation",
      metadata: {
        provider: "GITHUB",
        installationCount: result.installations.length,
        repositoryCount: result.repositories.length
      }
    });
    return this.status(principal);
  }

  public async listRepositories(
    principal: RequestPrincipal
  ): Promise<GithubRepositoryList> {
    const records = await this.installations.listRepositories(
      this.context(principal)
    );
    return { data: records.map(toRepository) };
  }

  public async listActionReviews(
    principal: RequestPrincipal
  ): Promise<GithubActionReviewList> {
    const records = await this.actionReviews.list(this.context(principal));
    return {
      data: records.map(toActionReview),
      page: { cursor: null, nextCursor: null, limit: 100 }
    };
  }

  public async createActionReview(
    principal: RequestPrincipal,
    input: CreateGithubActionReview
  ): Promise<GithubActionReview> {
    const context = this.context(principal);
    const repository = await this.installations.findActiveRepositoryByFullName(
      context,
      input.repositoryFullName
    );
    if (!repository) {
      throw new NotFoundException("GitHub repository was not found.");
    }
    const record = await this.actionReviews.create(context, {
      ...input,
      repository
    });
    await this.auditActionReview(
      principal,
      "github.action_review.created",
      record
    );
    return toActionReview(record);
  }

  public async updateActionReview(
    principal: RequestPrincipal,
    reviewId: string,
    input: UpdateGithubActionReview
  ): Promise<GithubActionReview> {
    const record = await this.actionReviews.update(
      this.context(principal),
      reviewId,
      input
    );
    if (!record) {
      throw new NotFoundException("GitHub action review was not found.");
    }
    await this.auditActionReview(
      principal,
      "github.action_review.updated",
      record
    );
    return toActionReview(record);
  }

  public async rejectActionReview(
    principal: RequestPrincipal,
    reviewId: string
  ): Promise<GithubActionReview> {
    const record = await this.actionReviews.reject(
      this.context(principal),
      reviewId
    );
    if (!record) {
      throw new NotFoundException("GitHub action review was not found.");
    }
    await this.auditActionReview(
      principal,
      "github.action_review.rejected",
      record
    );
    return toActionReview(record);
  }

  public async submitActionReview(
    principal: RequestPrincipal,
    reviewId: string
  ): Promise<GithubActionReview> {
    this.requireConfigured();
    const context = this.context(principal);
    const record = await this.actionReviews.findById(context, reviewId);
    if (!record || !["NEEDS_REVIEW", "UPDATED"].includes(record.status)) {
      throw new NotFoundException("GitHub action review was not found.");
    }
    const repository = await this.installations.findActiveRepositoryByFullName(
      context,
      record.repositoryFullName
    );
    if (!repository || repository.id !== record.repositoryId) {
      throw new NotFoundException("GitHub repository was not found.");
    }
    const accessToken = await this.accessToken(context);
    const response = await this.submitReviewedAction(record, accessToken);
    const sent = await this.actionReviews.markSent(context, reviewId, {
      externalUrl: response.html_url ?? repository.htmlUrl
    });
    if (!sent) {
      throw new NotFoundException("GitHub action review was not found.");
    }
    await this.auditActionReview(principal, "github.action_review.sent", sent);
    return toActionReview(sent);
  }

  public async disconnect(
    principal: RequestPrincipal
  ): Promise<GithubConnectionStatus> {
    const context = this.context(principal);
    await Promise.all([
      this.connections.disconnect(context, "GITHUB"),
      this.installations.disconnectGithub(context)
    ]);
    await this.audit.record(principal, {
      action: "github.disconnected",
      resourceType: "external_connection",
      metadata: { provider: "GITHUB" }
    });
    return this.status(principal);
  }

  public async handleWebhook(input: {
    event: string | undefined;
    signature: string | undefined;
    payload: unknown;
  }): Promise<{ accepted: true }> {
    this.requireConfigured();
    this.verifyWebhookSignature(input.payload, input.signature);
    const installationId = installationIdFromPayload(input.payload);
    const action = actionFromPayload(input.payload);
    if (
      installationId &&
      input.event === "installation" &&
      ["deleted", "suspend"].includes(action ?? "")
    ) {
      await this.installations.markGithubInstallation(
        installationId,
        action === "deleted" ? "DELETED" : "SUSPENDED"
      );
    }
    if (
      installationId &&
      input.event === "installation" &&
      ["created", "unsuspend"].includes(action ?? "")
    ) {
      await this.installations.markGithubInstallation(installationId, "ACTIVE");
    }
    return { accepted: true };
  }

  private async accessToken(context: TenantContext): Promise<string> {
    const connection = await this.connections.find(context, "GITHUB");
    if (!connection?.encryptedAccessToken) {
      throw new BadRequestException({
        code: "EXTERNAL_CONNECTION_NOT_FOUND",
        message: "GitHub is not connected."
      });
    }
    if (connection.expiresAt && connection.expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException({
        code: "EXTERNAL_CONNECTION_EXPIRED",
        message: "GitHub connection is expired."
      });
    }
    return this.tokenCrypto.decrypt(
      this.config.tokenEncryptionKey!,
      connection.encryptedAccessToken
    );
  }

  private async exchangeCode(code: string): Promise<GithubTokenResponse> {
    const response = await fetch(githubTokenUrl, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        client_id: this.config.clientId!,
        client_secret: this.config.clientSecret!,
        code,
        redirect_uri: this.config.redirectUri!
      })
    });
    if (!response.ok) {
      throw new BadRequestException({
        code: "GITHUB_OAUTH_EXCHANGE_FAILED",
        message: "GitHub OAuth token exchange failed."
      });
    }
    return (await response.json()) as GithubTokenResponse;
  }

  private async fetchUser(accessToken: string): Promise<GithubUserResponse> {
    return this.githubGet<GithubUserResponse>("/user", accessToken);
  }

  private async fetchInstallations(
    accessToken: string
  ): Promise<SyncExternalInstallationInput[]> {
    const response = await this.githubGet<{
      installations: GithubInstallationResponse[];
    }>("/user/installations", accessToken);
    const result: SyncExternalInstallationInput[] = [];
    for (const installation of response.installations) {
      const repositories = await this.githubGet<{
        repositories: GithubRepositoryResponse[];
      }>(
        `/user/installations/${installation.id}/repositories?per_page=100`,
        accessToken
      );
      result.push(toInstallationInput(installation, repositories.repositories));
    }
    return result;
  }

  private async githubGet<T>(path: string, accessToken: string): Promise<T> {
    const response = await fetch(`${githubApiUrl}${path}`, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${accessToken}`,
        "X-GitHub-Api-Version": "2022-11-28"
      }
    });
    if (!response.ok) {
      throw new BadRequestException({
        code: "GITHUB_API_REQUEST_FAILED",
        message: "GitHub API request failed."
      });
    }
    return (await response.json()) as T;
  }

  private async githubPost<T>(
    path: string,
    accessToken: string,
    body: Record<string, unknown>
  ): Promise<T> {
    const response = await fetch(`${githubApiUrl}${path}`, {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28"
      },
      body: JSON.stringify(body)
    });
    if (!response.ok) {
      throw new BadRequestException({
        code: "GITHUB_API_REQUEST_FAILED",
        message: "GitHub API request failed."
      });
    }
    return (await response.json()) as T;
  }

  private submitReviewedAction(
    record: GithubActionReviewRecord,
    accessToken: string
  ): Promise<GithubActionResponse> {
    const repositoryPath = githubRepositoryPath(record.repositoryFullName);
    if (record.kind === "ISSUE_CREATION") {
      if (!record.title) {
        throw new BadRequestException({
          code: "GITHUB_ACTION_REVIEW_INVALID",
          message: "GitHub issue creation review is missing a title."
        });
      }
      return this.githubPost<GithubActionResponse>(
        `/repos/${repositoryPath}/issues`,
        accessToken,
        { title: record.title, body: record.body }
      );
    }
    const number =
      record.kind === "PULL_REQUEST_COMMENT"
        ? record.pullRequestNumber
        : record.issueNumber;
    if (!number) {
      throw new BadRequestException({
        code: "GITHUB_ACTION_REVIEW_INVALID",
        message: "GitHub action review is missing a target number."
      });
    }
    return this.githubPost<GithubActionResponse>(
      `/repos/${repositoryPath}/issues/${number}/comments`,
      accessToken,
      { body: record.body }
    );
  }

  private requireConfigured(): void {
    if (!isGithubConfigured(this.config)) {
      throw new ServiceUnavailableException({
        code: "GITHUB_APP_MISCONFIGURED",
        message: "GitHub App OAuth is not configured.",
        missingConfigKeys: missingGithubConfigKeys(this.config)
      });
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
        message: "Invalid GitHub OAuth state."
      });
    }
  }

  private verifyWebhookSignature(
    payload: unknown,
    signature: string | undefined
  ): void {
    if (!signature?.startsWith("sha256=")) {
      throw new UnauthorizedException({
        code: "GITHUB_WEBHOOK_SIGNATURE_INVALID",
        message: "GitHub webhook signature is invalid."
      });
    }
    const body = JSON.stringify(payload);
    const expected = `sha256=${createHmac("sha256", this.config.webhookSecret!)
      .update(body)
      .digest("hex")}`;
    if (!safeEqual(signature, expected)) {
      throw new UnauthorizedException({
        code: "GITHUB_WEBHOOK_SIGNATURE_INVALID",
        message: "GitHub webhook signature is invalid."
      });
    }
  }

  private statusResponse(
    connection: ExternalConnectionRecord | null,
    counts: { installations: number; repositories: number }
  ): GithubConnectionStatus {
    const configured = isGithubConfigured(this.config);
    return {
      provider: "GITHUB",
      status: configured ? connectionState(connection) : "MISCONFIGURED",
      accountLogin: connection?.accountEmail ?? null,
      scopes: connection ? [...connection.scopes] : [],
      missingConfigKeys: missingGithubConfigKeys(this.config),
      connectedAt: connection?.createdAt.toISOString() ?? null,
      updatedAt: connection?.updatedAt.toISOString() ?? null,
      installationCount: counts.installations,
      repositoryCount: counts.repositories
    };
  }

  private context(principal: RequestPrincipal): TenantContext {
    return {
      tenantId: principal.tenantId,
      userId: principal.userId,
      correlationId: principal.sessionId
    };
  }

  private stateSecret(): string {
    return process.env.JWT_SECRET ?? "local-github-oauth-state-secret";
  }

  private async auditActionReview(
    principal: RequestPrincipal,
    action: string,
    record: GithubActionReviewRecord
  ): Promise<void> {
    await this.audit.record(principal, {
      action,
      resourceType: "github_action_review",
      resourceId: record.id,
      metadata: {
        kind: record.kind,
        status: record.status,
        repositoryFullName: record.repositoryFullName,
        issueNumber: record.issueNumber,
        pullRequestNumber: record.pullRequestNumber,
        hasTitle: Boolean(record.title),
        bodyLength: record.body.length
      }
    });
  }
}

function parseScopes(value: string | undefined): string[] {
  return value?.split(/[,\s]+/).filter(Boolean) ?? [];
}

function expiresAt(seconds: number | undefined): Date | null {
  return seconds ? new Date(Date.now() + seconds * 1000) : null;
}

function connectionState(
  connection: ExternalConnectionRecord | null
): GithubConnectionStatus["status"] {
  if (!connection) {
    return "DISCONNECTED";
  }
  if (connection.expiresAt && connection.expiresAt.getTime() <= Date.now()) {
    return "EXPIRED";
  }
  return connection.status;
}

function toInstallationInput(
  installation: GithubInstallationResponse,
  repositories: GithubRepositoryResponse[]
): SyncExternalInstallationInput {
  const accountLogin = installation.account?.login ?? "unknown";
  return {
    providerInstallationId: String(installation.id),
    accountLogin,
    accountType:
      installation.account?.type ?? installation.target_type ?? "User",
    repositorySelection: installation.repository_selection ?? null,
    permissions: installation.permissions ?? {},
    repositories: repositories.map((repository) => ({
      providerRepositoryId: String(repository.id),
      owner: repository.owner?.login ?? ownerFromFullName(repository.full_name),
      name: repository.name,
      fullName: repository.full_name,
      private: repository.private,
      defaultBranch: repository.default_branch ?? null,
      htmlUrl: repository.html_url
    }))
  };
}

function ownerFromFullName(fullName: string): string {
  return fullName.split("/")[0] ?? "unknown";
}

function toRepository(record: ExternalRepositoryRecord): GithubRepository {
  return {
    id: record.id,
    installationId: record.installationId,
    providerRepositoryId: record.providerRepositoryId,
    owner: record.owner,
    name: record.name,
    fullName: record.fullName,
    private: record.private,
    defaultBranch: record.defaultBranch,
    htmlUrl: record.htmlUrl,
    updatedAt: record.updatedAt.toISOString()
  };
}

function toActionReview(record: GithubActionReviewRecord): GithubActionReview {
  return {
    id: record.id,
    repositoryId: record.repositoryId,
    repositoryFullName: record.repositoryFullName,
    kind: record.kind,
    issueNumber: record.issueNumber,
    pullRequestNumber: record.pullRequestNumber,
    title: record.title,
    body: record.body,
    status: record.status,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    sentAt: record.sentAt?.toISOString() ?? null,
    externalUrl: record.externalUrl
  };
}

function githubRepositoryPath(fullName: string): string {
  const parts = fullName.split("/");
  const [owner, repository] = parts;
  if (parts.length !== 2 || !owner || !repository) {
    throw new BadRequestException({
      code: "GITHUB_REPOSITORY_INVALID",
      message: "GitHub repository name is invalid."
    });
  }
  return `${encodeURIComponent(owner)}/${encodeURIComponent(repository)}`;
}

function installationIdFromPayload(payload: unknown): string | null {
  const value = payload as { installation?: { id?: number | string } };
  return value.installation?.id ? String(value.installation.id) : null;
}

function actionFromPayload(payload: unknown): string | null {
  const value = payload as { action?: string };
  return value.action ?? null;
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}
