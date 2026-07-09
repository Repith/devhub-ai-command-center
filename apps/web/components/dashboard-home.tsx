"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import type {
  AgentDefinition,
  AgentRun,
  ChatUsage,
  ConversationMessage,
  GmailConnectionStatus,
  GmailDraftReview,
  NewsFeed,
  UsageSummary
} from "@devhub/contracts";

import { listAgents } from "@/lib/agents-api";
import { listDocuments } from "@/lib/documents-api";
import { getGmailStatus, listGmailDraftReviews } from "@/lib/gmail-api";
import { listNewsFeeds } from "@/lib/news-api";
import { listRuns, startRun } from "@/lib/runs-api";
import {
  useDurableRunChat,
  type DurableRunChatSendOptions
} from "@/lib/use-durable-run-chat";
import { getUsageSummary } from "@/lib/usage-api";
import {
  hasNewsIntent,
  pendingDraftReviews,
  summarizeDocuments,
  type DocumentSummary
} from "./dashboard-home-helpers";

type DashboardHomeSection =
  | "chat"
  | "agents"
  | "knowledge"
  | "gmail"
  | "news"
  | "analytics";

interface DashboardHomeProps {
  accessToken: string;
  onNavigate(section: DashboardHomeSection): void;
}

interface HomeChatMessage {
  id: string;
  role: "USER" | "ASSISTANT";
  content: string;
}

export function DashboardHome({
  accessToken,
  onNavigate
}: DashboardHomeProps): React.JSX.Element {
  const queryClient = useQueryClient();
  const [agentId, setAgentId] = useState("");
  const [draft, setDraft] = useState("");
  const chat = useDurableRunChat({ accessToken, agentId });

  const agentsQuery = useQuery({
    queryKey: ["agents", accessToken],
    queryFn: () => listAgents(accessToken)
  });
  const documentsQuery = useQuery({
    queryKey: ["documents"],
    queryFn: () => listDocuments(accessToken)
  });
  const gmailStatusQuery = useQuery({
    queryKey: ["gmail-status"],
    queryFn: () => getGmailStatus(accessToken)
  });
  const gmailReviewsQuery = useQuery({
    queryKey: ["gmail-draft-reviews"],
    queryFn: () => listGmailDraftReviews(accessToken)
  });
  const newsFeedsQuery = useQuery({
    queryKey: ["news-feeds"],
    queryFn: () => listNewsFeeds(accessToken)
  });
  const runsQuery = useQuery({
    queryKey: ["runs"],
    queryFn: () => listRuns(accessToken)
  });
  const usageQuery = useQuery({
    queryKey: ["usage", "7d"],
    queryFn: () => getUsageSummary(accessToken, "7d")
  });

  const selectedAgent =
    agentsQuery.data?.find((agent) => agent.id === agentId) ??
    agentsQuery.data?.[0] ??
    null;
  const dailyNewsAgent =
    agentsQuery.data?.find(
      (agent) => agent.templateKey === "daily-news-briefing"
    ) ?? null;
  const enabledNewsFeeds = (newsFeedsQuery.data ?? []).filter(
    (feed) => feed.enabled
  );
  const pendingReviews = pendingDraftReviews(gmailReviewsQuery.data ?? []);
  const documentSummary = summarizeDocuments(documentsQuery.data ?? []);
  const recentRuns = (runsQuery.data ?? []).slice(0, 5);

  useEffect(() => {
    if (!agentId && selectedAgent) {
      setAgentId(selectedAgent.id);
    }
  }, [agentId, selectedAgent]);

  const briefingMutation = useMutation({
    mutationFn: () => {
      if (!dailyNewsAgent) {
        throw new Error("Daily News Briefing agent is not installed.");
      }
      return startRun(accessToken, dailyNewsAgent.id, {
        message:
          "Prepare a concise briefing from the enabled tenant RSS feeds.",
        retrievalLimit: 5,
        newsFeedIds: enabledNewsFeeds.slice(0, 10).map((feed) => feed.id)
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["runs"] });
      await queryClient.invalidateQueries({ queryKey: ["usage"] });
    }
  });

  const sendMessage = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const message = draft.trim();
    if (!message || !selectedAgent || chat.isRunning) {
      return;
    }
    setDraft("");
    void chat.send(
      message,
      newsRunOptions(message, dailyNewsAgent, enabledNewsFeeds)
    );
  };

  return (
    <section className="workspace home-workspace" aria-labelledby="home-title">
      <div className="home-heading">
        <div>
          <p className="section-kicker">Command center</p>
          <h1 id="home-title">Today in your agent workspace</h1>
        </div>
        <div className="home-actions" aria-label="Workspace shortcuts">
          <button
            className="secondary-button"
            type="button"
            onClick={() => onNavigate("knowledge")}
          >
            Knowledge
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={() => onNavigate("analytics")}
          >
            Runs
          </button>
        </div>
      </div>

      <div className="home-grid">
        <section className="home-chat" aria-labelledby="home-chat-title">
          <div className="home-panel-heading">
            <div>
              <p className="section-kicker">Chat</p>
              <h2 id="home-chat-title">Ask an agent</h2>
            </div>
            <select
              aria-label="Selected agent"
              value={selectedAgent?.id ?? ""}
              disabled={agentsQuery.isPending || chat.isRunning}
              onChange={(event) => {
                setAgentId(event.target.value);
                chat.reset();
              }}
            >
              {(agentsQuery.data ?? []).map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name} / {agent.model}
                </option>
              ))}
            </select>
          </div>
          <HomeChatBody
            agents={agentsQuery.data ?? []}
            isLoading={agentsQuery.isPending}
            isError={agentsQuery.isError}
            messages={chat.messages.map(toHomeMessage)}
            assistantDraft={chat.assistantDraft}
            usage={chat.usage}
            error={chat.error}
            onRetryAgents={() => void agentsQuery.refetch()}
          />
          <form className="home-composer" onSubmit={sendMessage}>
            <label className="sr-only" htmlFor="home-chat-message">
              Message
            </label>
            <textarea
              id="home-chat-message"
              value={draft}
              rows={3}
              placeholder="Ask about your knowledge base, mailbox, news, or usage..."
              disabled={!selectedAgent || chat.isRunning}
              onChange={(event) => setDraft(event.currentTarget.value)}
            />
            {chat.isRunning ? (
              <button
                className="secondary-button"
                type="button"
                onClick={() => void chat.cancel()}
              >
                Cancel
              </button>
            ) : null}
            <button
              className="primary-button"
              type="submit"
              disabled={!selectedAgent || !draft.trim() || chat.isRunning}
            >
              {chat.isRunning ? "Running" : "Send"}
            </button>
          </form>
        </section>

        <aside className="home-side" aria-label="Workspace state">
          <KnowledgeCard
            summary={documentSummary}
            isLoading={documentsQuery.isPending}
            isError={documentsQuery.isError}
            onRetry={() => void documentsQuery.refetch()}
            onOpen={() => onNavigate("knowledge")}
          />
          <GmailCard
            status={gmailStatusQuery.data ?? null}
            reviews={pendingReviews}
            isLoading={
              gmailStatusQuery.isPending || gmailReviewsQuery.isPending
            }
            isError={gmailStatusQuery.isError || gmailReviewsQuery.isError}
            onRetry={() => {
              void gmailStatusQuery.refetch();
              void gmailReviewsQuery.refetch();
            }}
            onOpen={() => onNavigate("gmail")}
          />
          <NewsCard
            feeds={enabledNewsFeeds}
            isLoading={newsFeedsQuery.isPending}
            isError={newsFeedsQuery.isError}
            isRunning={briefingMutation.isPending}
            canRun={Boolean(dailyNewsAgent && enabledNewsFeeds.length > 0)}
            error={
              briefingMutation.error instanceof Error
                ? briefingMutation.error.message
                : null
            }
            onRetry={() => void newsFeedsQuery.refetch()}
            onOpen={() => onNavigate("news")}
            onRun={() => void briefingMutation.mutateAsync()}
          />
        </aside>

        <UsageHomeCard
          usage={usageQuery.data ?? null}
          isLoading={usageQuery.isPending}
          isError={usageQuery.isError}
          onRetry={() => void usageQuery.refetch()}
          onOpen={() => onNavigate("analytics")}
        />
        <RunsHomeCard
          runs={recentRuns}
          isLoading={runsQuery.isPending}
          isError={runsQuery.isError}
          onRetry={() => void runsQuery.refetch()}
          onOpen={() => onNavigate("analytics")}
        />
      </div>
    </section>
  );
}

function newsRunOptions(
  message: string,
  dailyNewsAgent: AgentDefinition | null,
  enabledNewsFeeds: readonly NewsFeed[]
): DurableRunChatSendOptions | undefined {
  if (
    !hasNewsIntent(message) ||
    !dailyNewsAgent ||
    enabledNewsFeeds.length === 0
  ) {
    return undefined;
  }
  return {
    agentId: dailyNewsAgent.id,
    input: {
      newsFeedIds: enabledNewsFeeds.slice(0, 10).map((feed) => feed.id),
      retrievalLimit: 5
    }
  };
}

function HomeChatBody({
  agents,
  isLoading,
  isError,
  messages,
  assistantDraft,
  usage,
  error,
  onRetryAgents
}: {
  agents: readonly AgentDefinition[];
  isLoading: boolean;
  isError: boolean;
  messages: readonly HomeChatMessage[];
  assistantDraft: string;
  usage: ChatUsage | undefined;
  error: string;
  onRetryAgents(): void;
}): React.JSX.Element {
  if (isLoading) {
    return <PanelState label="Loading agents" />;
  }
  if (isError) {
    return (
      <PanelState
        label="Agents failed to load"
        actionLabel="Retry"
        onAction={onRetryAgents}
      />
    );
  }
  if (agents.length === 0) {
    return <PanelState label="Install or create an agent to start chatting." />;
  }
  return (
    <div className="home-message-list" aria-live="polite">
      {messages.length === 0 && !assistantDraft ? (
        <div className="home-empty-chat">
          <strong>Ready for the first command.</strong>
          <span>Use the selected agent without leaving the home screen.</span>
        </div>
      ) : null}
      {messages.map((message) => (
        <article
          className={`chat-message ${message.role.toLowerCase()}`}
          key={message.id}
        >
          <span>{message.role === "USER" ? "You" : "Assistant"}</span>
          <p>{message.content}</p>
        </article>
      ))}
      {assistantDraft ? (
        <article className="chat-message assistant streaming">
          <span>Assistant / streaming</span>
          <p>{assistantDraft}</p>
        </article>
      ) : null}
      {error ? (
        <p className="workspace-alert" role="alert">
          {error}
        </p>
      ) : null}
      {usage ? (
        <p className="usage-line">
          {usage.provider}/{usage.model} / {usage.inputTokens} input /{" "}
          {usage.outputTokens} output / {usage.durationMs} ms
        </p>
      ) : null}
    </div>
  );
}

function KnowledgeCard({
  summary,
  isLoading,
  isError,
  onRetry,
  onOpen
}: {
  summary: DocumentSummary;
  isLoading: boolean;
  isError: boolean;
  onRetry(): void;
  onOpen(): void;
}): React.JSX.Element {
  return (
    <HomeMiniPanel
      kicker="Knowledge"
      title={`${summary.indexed}/${summary.total} indexed`}
      actionLabel="Open"
      onAction={onOpen}
      isLoading={isLoading}
      isError={isError}
      onRetry={onRetry}
      emptyLabel="No knowledge sources yet."
      hasData={summary.total > 0}
    >
      <div className="home-stat-row">
        <span>Processing</span>
        <strong>{summary.processing}</strong>
      </div>
      <div className="home-stat-row">
        <span>Failed</span>
        <strong>{summary.failed}</strong>
      </div>
    </HomeMiniPanel>
  );
}

function GmailCard({
  status,
  reviews,
  isLoading,
  isError,
  onRetry,
  onOpen
}: {
  status: GmailConnectionStatus | null;
  reviews: readonly GmailDraftReview[];
  isLoading: boolean;
  isError: boolean;
  onRetry(): void;
  onOpen(): void;
}): React.JSX.Element {
  return (
    <HomeMiniPanel
      kicker="Gmail"
      title={`${reviews.length} pending`}
      actionLabel="Review"
      onAction={onOpen}
      isLoading={isLoading}
      isError={isError}
      onRetry={onRetry}
      emptyLabel="No drafts waiting for approval."
      hasData={Boolean(status) || reviews.length > 0}
    >
      <div className="home-stat-row">
        <span>
          {status?.status.replace("_", " ").toLowerCase() ?? "unknown"}
        </span>
        <strong>{status?.accountEmail ?? "OAuth"}</strong>
      </div>
      {reviews.slice(0, 2).map((review) => (
        <div className="home-queue-item" key={review.id}>
          <strong>{review.subject}</strong>
          <span>{review.to.join(", ")}</span>
        </div>
      ))}
    </HomeMiniPanel>
  );
}

function NewsCard({
  feeds,
  isLoading,
  isError,
  isRunning,
  canRun,
  error,
  onRetry,
  onOpen,
  onRun
}: {
  feeds: readonly NewsFeed[];
  isLoading: boolean;
  isError: boolean;
  isRunning: boolean;
  canRun: boolean;
  error: string | null;
  onRetry(): void;
  onOpen(): void;
  onRun(): void;
}): React.JSX.Element {
  return (
    <HomeMiniPanel
      kicker="News"
      title={`${feeds.length} enabled feeds`}
      actionLabel="Feeds"
      onAction={onOpen}
      isLoading={isLoading}
      isError={isError}
      onRetry={onRetry}
      emptyLabel="Add RSS feeds before running a briefing."
      hasData={feeds.length > 0}
    >
      <div className="home-action-row">
        <button
          className="primary-button"
          type="button"
          disabled={!canRun || isRunning}
          onClick={onRun}
        >
          {isRunning ? "Starting" : "Run briefing"}
        </button>
      </div>
      {error ? (
        <p className="workspace-alert" role="alert">
          {error}
        </p>
      ) : null}
      {feeds.slice(0, 2).map((feed) => (
        <div className="home-queue-item" key={feed.id}>
          <strong>{feed.name}</strong>
          <span>{feed.topic ?? new URL(feed.url).host}</span>
        </div>
      ))}
    </HomeMiniPanel>
  );
}

function UsageHomeCard({
  usage,
  isLoading,
  isError,
  onRetry,
  onOpen
}: {
  usage: UsageSummary | null;
  isLoading: boolean;
  isError: boolean;
  onRetry(): void;
  onOpen(): void;
}): React.JSX.Element {
  return (
    <section className="home-panel" aria-labelledby="home-usage-title">
      <div className="home-panel-heading">
        <div>
          <p className="section-kicker">Tokens</p>
          <h2 id="home-usage-title">7 day spend</h2>
        </div>
        <button className="text-button" type="button" onClick={onOpen}>
          Runs
        </button>
      </div>
      {isLoading ? (
        <PanelState label="Loading usage" compact />
      ) : isError ? (
        <PanelState
          label="Usage failed to load"
          actionLabel="Retry"
          onAction={onRetry}
          compact
        />
      ) : usage ? (
        <>
          <div className="home-metric-grid">
            <Metric
              label="Tokens"
              value={usage.tenant.totalTokens.toLocaleString()}
            />
            <Metric
              label="Latency"
              value={`${usage.tenant.latencyMs.toLocaleString()} ms`}
            />
            <Metric
              label="Warnings"
              value={usage.budgetWarnings.length.toString()}
            />
          </div>
          <ol className="home-compact-list">
            {usage.providerModels.slice(0, 3).map((row) => (
              <li key={`${row.provider}/${row.model}`}>
                <span>
                  {row.provider}/{row.model}
                </span>
                <strong>{row.totalTokens.toLocaleString()}</strong>
              </li>
            ))}
          </ol>
        </>
      ) : (
        <PanelState label="No usage recorded yet." compact />
      )}
    </section>
  );
}

function RunsHomeCard({
  runs,
  isLoading,
  isError,
  onRetry,
  onOpen
}: {
  runs: readonly AgentRun[];
  isLoading: boolean;
  isError: boolean;
  onRetry(): void;
  onOpen(): void;
}): React.JSX.Element {
  return (
    <section className="home-panel" aria-labelledby="home-runs-title">
      <div className="home-panel-heading">
        <div>
          <p className="section-kicker">Runs</p>
          <h2 id="home-runs-title">Recent timeline</h2>
        </div>
        <button className="text-button" type="button" onClick={onOpen}>
          Open
        </button>
      </div>
      {isLoading ? (
        <PanelState label="Loading runs" compact />
      ) : isError ? (
        <PanelState
          label="Runs failed to load"
          actionLabel="Retry"
          onAction={onRetry}
          compact
        />
      ) : runs.length === 0 ? (
        <PanelState label="No agent runs yet." compact />
      ) : (
        <ol className="home-run-list">
          {runs.map((run) => (
            <li key={run.id}>
              <span className={`status-pill ${run.status.toLowerCase()}`}>
                {run.status}
              </span>
              <div>
                <strong>
                  {run.configSnapshot.templateKey ?? shortId(run.agentId)}
                </strong>
                <span>{run.createdAt}</span>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function HomeMiniPanel({
  kicker,
  title,
  actionLabel,
  onAction,
  isLoading,
  isError,
  onRetry,
  emptyLabel,
  hasData,
  children
}: {
  kicker: string;
  title: string;
  actionLabel: string;
  onAction(): void;
  isLoading: boolean;
  isError: boolean;
  onRetry(): void;
  emptyLabel: string;
  hasData: boolean;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <section className="home-panel">
      <div className="home-panel-heading">
        <div>
          <p className="section-kicker">{kicker}</p>
          <h2>{title}</h2>
        </div>
        <button className="text-button" type="button" onClick={onAction}>
          {actionLabel}
        </button>
      </div>
      {isLoading ? (
        <PanelState label={`Loading ${kicker.toLowerCase()}`} compact />
      ) : isError ? (
        <PanelState
          label={`${kicker} failed to load`}
          actionLabel="Retry"
          onAction={onRetry}
          compact
        />
      ) : hasData ? (
        <div className="home-panel-body">{children}</div>
      ) : (
        <PanelState label={emptyLabel} compact />
      )}
    </section>
  );
}

function Metric({
  label,
  value
}: {
  label: string;
  value: string;
}): React.JSX.Element {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function PanelState({
  label,
  actionLabel,
  onAction,
  compact = false
}: {
  label: string;
  actionLabel?: string;
  onAction?: () => void;
  compact?: boolean;
}): React.JSX.Element {
  return (
    <div className={`home-panel-state ${compact ? "compact" : ""}`}>
      <span>{label}</span>
      {actionLabel && onAction ? (
        <button className="secondary-button" type="button" onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}

function toHomeMessage(message: ConversationMessage): HomeChatMessage {
  return {
    id: message.id,
    role: message.role,
    content: message.content
  };
}

function shortId(id: string): string {
  return id.slice(0, 8);
}
