"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type {
  GithubConnectionStatus,
  GithubRepository,
  GmailConnectionStatus
} from "@devhub/contracts";

import { formatApiClientError } from "../lib/api-client";
import {
  connectGmail,
  connectGmailDevMock,
  disconnectGmail,
  getGmailStatus
} from "../lib/gmail-api";
import {
  connectGithub,
  disconnectGithub,
  getGithubStatus,
  listGithubRepositories,
  syncGithubInstallations
} from "../lib/github-api";

interface IntegrationsWorkspaceProps {
  accessToken: string;
  canManage: boolean;
}

export function IntegrationsWorkspace({
  accessToken,
  canManage
}: IntegrationsWorkspaceProps): React.JSX.Element {
  const queryClient = useQueryClient();
  const gmailStatus = useQuery({
    queryKey: ["gmail-status"],
    queryFn: () => getGmailStatus(accessToken)
  });
  const githubStatus = useQuery({
    queryKey: ["github-status"],
    queryFn: () => getGithubStatus(accessToken)
  });
  const githubRepositories = useQuery({
    queryKey: ["github-repositories"],
    queryFn: () => listGithubRepositories(accessToken)
  });

  const connectGmailMutation = useMutation({
    mutationFn: () => connectGmail(accessToken),
    onSuccess: (response) => {
      window.location.assign(response.authorizationUrl);
    }
  });
  const mockGmailMutation = useMutation({
    mutationFn: () => connectGmailDevMock(accessToken),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["gmail-status"] });
    }
  });
  const disconnectGmailMutation = useMutation({
    mutationFn: () => disconnectGmail(accessToken),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["gmail-status"] });
    }
  });
  const connectGithubMutation = useMutation({
    mutationFn: () => connectGithub(accessToken),
    onSuccess: (response) => {
      window.location.assign(response.authorizationUrl);
    }
  });
  const syncGithubMutation = useMutation({
    mutationFn: () => syncGithubInstallations(accessToken),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["github-status"] }),
        queryClient.invalidateQueries({ queryKey: ["github-repositories"] })
      ]);
    }
  });
  const disconnectGithubMutation = useMutation({
    mutationFn: () => disconnectGithub(accessToken),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["github-status"] }),
        queryClient.invalidateQueries({ queryKey: ["github-repositories"] })
      ]);
    }
  });

  const error =
    connectGmailMutation.error ??
    mockGmailMutation.error ??
    disconnectGmailMutation.error ??
    connectGithubMutation.error ??
    syncGithubMutation.error ??
    disconnectGithubMutation.error ??
    null;

  return (
    <section
      className="workspace integrations-workspace"
      id="integrations"
      aria-labelledby="integrations-title"
    >
      <div className="workspace-heading">
        <div>
          <p className="section-kicker">External integrations</p>
          <h1 id="integrations-title">Connect the tools agents can inspect.</h1>
          <p>
            OAuth tokens stay server-side. Agents receive only validated tool
            results from explicitly enabled Gmail and GitHub capabilities.
          </p>
        </div>
        <div className="workspace-actions">
          <div className="environment-badge">
            <span className="status-dot" aria-hidden="true" />
            Tenant scoped
          </div>
        </div>
      </div>

      {!canManage ? (
        <p className="workspace-alert neutral" role="status">
          Member access is read-only. Ask an owner or admin to connect,
          synchronize, or disconnect integrations.
        </p>
      ) : null}

      {error ? (
        <p className="workspace-alert" role="alert">
          {formatApiClientError(error)}
        </p>
      ) : null}

      <div className="integrations-grid">
        <GmailIntegrationCard
          status={gmailStatus.data ?? null}
          isLoading={gmailStatus.isPending}
          isError={gmailStatus.isError}
          canManage={canManage}
          isConnecting={connectGmailMutation.isPending}
          isMocking={mockGmailMutation.isPending}
          isDisconnecting={disconnectGmailMutation.isPending}
          onConnect={() => void connectGmailMutation.mutateAsync()}
          onMock={() => void mockGmailMutation.mutateAsync()}
          onDisconnect={() => void disconnectGmailMutation.mutateAsync()}
          onRetry={() => void gmailStatus.refetch()}
        />
        <GithubIntegrationCard
          status={githubStatus.data ?? null}
          repositories={githubRepositories.data ?? []}
          isLoading={githubStatus.isPending || githubRepositories.isPending}
          isError={githubStatus.isError || githubRepositories.isError}
          canManage={canManage}
          isConnecting={connectGithubMutation.isPending}
          isSyncing={syncGithubMutation.isPending}
          isDisconnecting={disconnectGithubMutation.isPending}
          onConnect={() => void connectGithubMutation.mutateAsync()}
          onSync={() => void syncGithubMutation.mutateAsync()}
          onDisconnect={() => void disconnectGithubMutation.mutateAsync()}
          onRetry={() => {
            void githubStatus.refetch();
            void githubRepositories.refetch();
          }}
        />
      </div>
    </section>
  );
}

interface GmailIntegrationCardProps {
  status: GmailConnectionStatus | null;
  isLoading: boolean;
  isError: boolean;
  canManage: boolean;
  isConnecting: boolean;
  isMocking: boolean;
  isDisconnecting: boolean;
  onConnect(): void;
  onMock(): void;
  onDisconnect(): void;
  onRetry(): void;
}

function GmailIntegrationCard({
  status,
  isLoading,
  isError,
  canManage,
  isConnecting,
  isMocking,
  isDisconnecting,
  onConnect,
  onMock,
  onDisconnect,
  onRetry
}: GmailIntegrationCardProps): React.JSX.Element {
  const state = status?.status ?? "DISCONNECTED";
  const disabled = !canManage || isConnecting || isMocking || isDisconnecting;
  return (
    <article className="integration-card">
      <IntegrationCardHeader
        label="Gmail"
        status={state}
        subtitle={status?.accountEmail ?? "OAuth + reviewed draft writes"}
      />
      {isLoading ? <p className="muted">Loading Gmail status...</p> : null}
      {isError ? (
        <InlineError message="Gmail status failed to load." onRetry={onRetry} />
      ) : null}
      {status ? (
        <dl className="integration-facts">
          <div>
            <dt>Account</dt>
            <dd>{status.accountEmail ?? "Not connected"}</dd>
          </div>
          <div>
            <dt>Scopes</dt>
            <dd>{status.scopes.length ? status.scopes.join(", ") : "None"}</dd>
          </div>
          <div>
            <dt>Missing config</dt>
            <dd>
              {status.missingConfigKeys.length
                ? status.missingConfigKeys.join(", ")
                : "None"}
            </dd>
          </div>
        </dl>
      ) : null}
      <div className="integration-actions">
        <button
          className="secondary-button"
          type="button"
          disabled={disabled || state === "MISCONFIGURED"}
          onClick={onConnect}
        >
          {state === "CONNECTED" ? "Reconnect Gmail" : "Connect Gmail"}
        </button>
        {state !== "CONNECTED" ? (
          <button
            className="text-button"
            type="button"
            disabled={disabled}
            onClick={onMock}
          >
            Simulate Gmail
          </button>
        ) : null}
        <button
          className="text-button"
          type="button"
          disabled={disabled || state !== "CONNECTED"}
          onClick={onDisconnect}
        >
          Disconnect
        </button>
      </div>
    </article>
  );
}

interface GithubIntegrationCardProps {
  status: GithubConnectionStatus | null;
  repositories: readonly GithubRepository[];
  isLoading: boolean;
  isError: boolean;
  canManage: boolean;
  isConnecting: boolean;
  isSyncing: boolean;
  isDisconnecting: boolean;
  onConnect(): void;
  onSync(): void;
  onDisconnect(): void;
  onRetry(): void;
}

function GithubIntegrationCard({
  status,
  repositories,
  isLoading,
  isError,
  canManage,
  isConnecting,
  isSyncing,
  isDisconnecting,
  onConnect,
  onSync,
  onDisconnect,
  onRetry
}: GithubIntegrationCardProps): React.JSX.Element {
  const state = status?.status ?? "DISCONNECTED";
  const disabled = !canManage || isConnecting || isSyncing || isDisconnecting;
  return (
    <article className="integration-card">
      <IntegrationCardHeader
        label="GitHub"
        status={state}
        subtitle={
          status?.accountLogin ?? "GitHub App installation + repo reads"
        }
      />
      {isLoading ? <p className="muted">Loading GitHub status...</p> : null}
      {isError ? (
        <InlineError
          message="GitHub status failed to load."
          onRetry={onRetry}
        />
      ) : null}
      {status ? (
        <dl className="integration-facts">
          <div>
            <dt>Account</dt>
            <dd>{status.accountLogin ?? "Not connected"}</dd>
          </div>
          <div>
            <dt>Installations</dt>
            <dd>{status.installationCount}</dd>
          </div>
          <div>
            <dt>Repositories</dt>
            <dd>{status.repositoryCount}</dd>
          </div>
          <div>
            <dt>Missing config</dt>
            <dd>
              {status.missingConfigKeys.length
                ? status.missingConfigKeys.join(", ")
                : "None"}
            </dd>
          </div>
        </dl>
      ) : null}
      <RepositoryList repositories={repositories} />
      <div className="integration-actions">
        <button
          className="secondary-button"
          type="button"
          disabled={disabled || state === "MISCONFIGURED"}
          onClick={onConnect}
        >
          {state === "CONNECTED" ? "Reconnect GitHub" : "Connect GitHub"}
        </button>
        <button
          className="text-button"
          type="button"
          disabled={disabled || state !== "CONNECTED"}
          onClick={onSync}
        >
          Sync repositories
        </button>
        <button
          className="text-button"
          type="button"
          disabled={disabled || state !== "CONNECTED"}
          onClick={onDisconnect}
        >
          Disconnect
        </button>
      </div>
    </article>
  );
}

function IntegrationCardHeader({
  label,
  status,
  subtitle
}: {
  label: string;
  status: string;
  subtitle: string;
}): React.JSX.Element {
  return (
    <div className="integration-card-header">
      <div>
        <p className="section-kicker">{label}</p>
        <h2>{label}</h2>
        <span>{subtitle}</span>
      </div>
      <span className={`setup-chip ${setupClass(status)}`}>
        {status.replace("_", " ")}
      </span>
    </div>
  );
}

function RepositoryList({
  repositories
}: {
  repositories: readonly GithubRepository[];
}): React.JSX.Element {
  if (repositories.length === 0) {
    return (
      <div className="repository-list empty">
        <span>No synchronized repositories.</span>
      </div>
    );
  }
  return (
    <ul className="repository-list" aria-label="Authorized GitHub repositories">
      {repositories.slice(0, 8).map((repository) => (
        <li key={repository.id}>
          <strong>{repository.fullName}</strong>
          <span>
            {repository.private ? "private" : "public"} /{" "}
            {repository.defaultBranch ?? "no default branch"}
          </span>
        </li>
      ))}
    </ul>
  );
}

function InlineError({
  message,
  onRetry
}: {
  message: string;
  onRetry(): void;
}): React.JSX.Element {
  return (
    <div className="inline-error" role="alert">
      <span>{message}</span>
      <button className="text-button" type="button" onClick={onRetry}>
        Retry
      </button>
    </div>
  );
}

function setupClass(status: string): string {
  if (status === "CONNECTED") {
    return "ready";
  }
  if (status === "MISCONFIGURED" || status === "EXPIRED") {
    return "misconfigured";
  }
  return "needs-setup";
}
