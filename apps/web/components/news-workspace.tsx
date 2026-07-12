"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import type {
  AgentRun,
  NewsFeed,
  NewsFeedRefreshResponse
} from "@devhub/contracts";

import {
  createNewsFeed,
  deleteNewsFeed,
  listNewsFeeds,
  refreshNewsFeeds,
  updateNewsFeed
} from "@/lib/news-api";
import { formatApiClientError } from "@/lib/api-client";
import { listAgents } from "@/lib/agents-api";
import { getRunSnapshot, startRun } from "@/lib/runs-api";

interface NewsWorkspaceProps {
  accessToken: string;
  canManage: boolean;
}

interface NewsFeedFormState {
  name: string;
  url: string;
  topic: string;
  enabled: boolean;
}

export function NewsWorkspace({
  accessToken,
  canManage
}: NewsWorkspaceProps): React.JSX.Element {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [refreshResult, setRefreshResult] =
    useState<NewsFeedRefreshResponse | null>(null);
  const [briefingRun, setBriefingRun] = useState<AgentRun | null>(null);
  const feedsQuery = useQuery({
    queryKey: ["news-feeds"],
    queryFn: () => listNewsFeeds(accessToken)
  });
  const feeds = feedsQuery.data ?? [];
  const agentsQuery = useQuery({
    queryKey: ["agents", accessToken],
    queryFn: () => listAgents(accessToken)
  });
  const briefingAgent = agentsQuery.data?.find(
    (agent) => agent.templateKey === "daily-news-briefing"
  );
  const briefingQuery = useQuery({
    queryKey: ["run-snapshot", briefingRun?.id],
    queryFn: () => getRunSnapshot(accessToken, briefingRun!.id),
    enabled: Boolean(briefingRun),
    refetchInterval: (query) => {
      const status = query.state.data?.run.status;
      return status &&
        ["COMPLETED", "FAILED", "CANCELLED", "TIMED_OUT"].includes(status)
        ? false
        : 1_500;
    }
  });
  const selectedFeed =
    feeds.find((feed) => feed.id === selectedId) ??
    (creating ? null : (feeds[0] ?? null));

  const saveMutation = useMutation({
    mutationFn: (input: NewsFeedFormState) =>
      selectedFeed && !creating
        ? updateNewsFeed(accessToken, selectedFeed.id, toFeedInput(input))
        : createNewsFeed(accessToken, toFeedInput(input)),
    onSuccess: async (feed) => {
      setCreating(false);
      setSelectedId(feed.id);
      await queryClient.invalidateQueries({ queryKey: ["news-feeds"] });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (feedId: string) => deleteNewsFeed(accessToken, feedId),
    onSuccess: async () => {
      setSelectedId(null);
      setCreating(false);
      await queryClient.invalidateQueries({ queryKey: ["news-feeds"] });
    }
  });
  const refreshMutation = useMutation({
    mutationFn: () => refreshNewsFeeds(accessToken),
    onSuccess: async (result) => {
      setRefreshResult(result);
      await queryClient.invalidateQueries({ queryKey: ["news-feeds"] });
    }
  });
  const briefingMutation = useMutation({
    mutationFn: () => {
      if (!briefingAgent) {
        throw new Error("Install the Daily News Briefing agent first.");
      }
      return startRun(accessToken, briefingAgent.id, {
        message:
          "Prepare a concise briefing from the enabled tenant RSS feeds.",
        retrievalLimit: 5,
        newsFeedIds: feeds
          .filter((feed) => feed.enabled)
          .slice(0, 10)
          .map((feed) => feed.id)
      });
    },
    onSuccess: setBriefingRun
  });

  return (
    <section className="workspace" id="news" aria-labelledby="news-title">
      <div className="workspace-heading">
        <div>
          <p className="section-kicker">RSS feeds</p>
          <h1 id="news-title">Choose the sources before the briefing.</h1>
          <p>
            Tenant-owned feeds define the only RSS sources the Daily News
            Briefing graph can read by default.
          </p>
        </div>
        <div className="workspace-actions">
          <button
            className="secondary-button"
            type="button"
            disabled={
              refreshMutation.isPending || feeds.every((feed) => !feed.enabled)
            }
            onClick={() => void refreshMutation.mutateAsync()}
          >
            {refreshMutation.isPending ? "Refreshing..." : "Refresh feeds"}
          </button>
          <button
            className="primary-button"
            type="button"
            disabled={
              briefingMutation.isPending ||
              !briefingAgent ||
              feeds.every((feed) => !feed.enabled)
            }
            onClick={() => void briefingMutation.mutateAsync()}
          >
            {briefingMutation.isPending ? "Starting..." : "Run briefing"}
          </button>
          <div className="environment-badge">
            <span className="status-dot" aria-hidden="true" />
            RSS only
          </div>
          {canManage ? (
            <button
              className="secondary-button"
              type="button"
              onClick={() => {
                setCreating(true);
                setSelectedId(null);
              }}
            >
              Add feed
            </button>
          ) : null}
        </div>
      </div>

      <div className="workspace-grid">
        <NewsFeedList
          feeds={feeds}
          selectedId={creating ? null : (selectedFeed?.id ?? null)}
          status={
            feedsQuery.isPending
              ? "loading"
              : feedsQuery.isError
                ? "error"
                : "success"
          }
          onRetry={() => void feedsQuery.refetch()}
          onSelect={(feedId) => {
            setCreating(false);
            setSelectedId(feedId);
          }}
        />
        <NewsFeedEditor
          key={creating ? "new" : (selectedFeed?.id ?? "empty")}
          feed={creating ? null : selectedFeed}
          canManage={canManage}
          isNew={creating}
          isSaving={saveMutation.isPending}
          isDeleting={deleteMutation.isPending}
          error={
            saveMutation.error instanceof Error
              ? formatApiClientError(saveMutation.error)
              : deleteMutation.error instanceof Error
                ? formatApiClientError(deleteMutation.error)
                : null
          }
          onSave={(input) => saveMutation.mutateAsync(input)}
          {...(selectedFeed
            ? { onDelete: () => deleteMutation.mutateAsync(selectedFeed.id) }
            : {})}
          onCancel={() => {
            setCreating(false);
            saveMutation.reset();
          }}
        />
      </div>
      <section className="news-results" aria-live="polite">
        <div className="panel-heading">
          <div>
            <p className="section-kicker">Latest items</p>
            <h2>RSS reader</h2>
          </div>
          {refreshResult ? (
            <span>
              {refreshResult.fetchedFeedCount} feeds /{" "}
              {refreshResult.failedFeedCount} failed
            </span>
          ) : null}
        </div>
        {refreshResult?.items.length ? (
          <ol className="feed-list">
            {refreshResult.items.map((item, index) => (
              <li key={`${item.feedId}-${item.url ?? item.title}-${index}`}>
                <article>
                  <span>
                    {item.feedName}
                    {item.publishedAt ? ` / ${item.publishedAt}` : ""}
                  </span>
                  <h3>
                    {item.url ? (
                      <a href={item.url} target="_blank" rel="noreferrer">
                        {item.title}
                      </a>
                    ) : (
                      item.title
                    )}
                  </h3>
                  <p>{item.summary}</p>
                </article>
              </li>
            ))}
          </ol>
        ) : (
          <p>Refresh enabled feeds to display their latest items.</p>
        )}
        {briefingQuery.data ? (
          <div className="template-detail">
            <strong>Briefing: {briefingQuery.data.run.status}</strong>
            <p>
              {briefingQuery.data.steps
                .toSorted((a, b) => b.sequence - a.sequence)
                .find((step) => step.outputPreview)?.outputPreview ??
                "Waiting for the worker..."}
            </p>
          </div>
        ) : null}
        {refreshMutation.error instanceof Error ||
        briefingMutation.error instanceof Error ? (
          <p className="workspace-alert" role="alert">
            {formatApiClientError(
              (refreshMutation.error ?? briefingMutation.error) as Error
            )}
          </p>
        ) : null}
      </section>
    </section>
  );
}

function NewsFeedList({
  feeds,
  selectedId,
  status,
  onRetry,
  onSelect
}: {
  feeds: readonly NewsFeed[];
  selectedId: string | null;
  status: "loading" | "error" | "success";
  onRetry(): void;
  onSelect(feedId: string): void;
}): React.JSX.Element {
  if (status === "loading") {
    return (
      <aside className="agent-list-panel panel-state">
        <div className="loader" aria-hidden="true" />
        <p>Loading feeds</p>
      </aside>
    );
  }
  if (status === "error") {
    return (
      <aside className="agent-list-panel panel-state" role="alert">
        <p>Feeds failed to load.</p>
        <button className="secondary-button" type="button" onClick={onRetry}>
          Retry
        </button>
      </aside>
    );
  }
  if (feeds.length === 0) {
    return (
      <aside className="agent-list-panel panel-state">
        <div className="empty-orbit" aria-hidden="true">
          <span>R</span>
        </div>
        <p>No RSS feeds yet.</p>
        <span>Add trusted sources before running Daily News Briefing.</span>
      </aside>
    );
  }
  return (
    <aside className="agent-list-panel">
      <div className="panel-heading">
        <h2>Tenant feeds</h2>
      </div>
      <ol className="feed-list">
        {feeds.map((feed) => (
          <li key={feed.id}>
            <button
              className={feed.id === selectedId ? "selected" : ""}
              type="button"
              onClick={() => onSelect(feed.id)}
            >
              <span
                className={`connection-indicator ${
                  feed.enabled ? "connected" : ""
                }`}
                aria-hidden="true"
              />
              <span>
                <strong>{feed.name}</strong>
                <small>{feed.topic ?? new URL(feed.url).host}</small>
              </span>
            </button>
          </li>
        ))}
      </ol>
    </aside>
  );
}

function NewsFeedEditor({
  feed,
  canManage,
  isNew,
  isSaving,
  isDeleting,
  error,
  onSave,
  onDelete,
  onCancel
}: {
  feed: NewsFeed | null;
  canManage: boolean;
  isNew: boolean;
  isSaving: boolean;
  isDeleting: boolean;
  error: string | null;
  onSave(input: NewsFeedFormState): Promise<NewsFeed>;
  onDelete?: () => Promise<void>;
  onCancel(): void;
}): React.JSX.Element {
  const initial = useMemo(() => toFormState(feed), [feed]);
  const [form, setForm] = useState<NewsFeedFormState>(initial);

  useEffect(() => {
    setForm(initial);
  }, [initial]);

  if (!feed && !isNew) {
    return (
      <section className="editor-panel panel-state">
        <p>Select or add a feed.</p>
        <span>Configured RSS sources will appear here.</span>
      </section>
    );
  }

  return (
    <section className="editor-panel">
      <div className="panel-heading editor-heading">
        <div>
          <p className="section-kicker">{isNew ? "New source" : "Feed"}</p>
          <h2>{isNew ? "Add RSS feed" : feed?.name}</h2>
        </div>
        {feed ? (
          <span className="saved-state">{feed.lastFetchStatus}</span>
        ) : null}
      </div>
      {feed ? (
        <div className="template-detail">
          <strong>Fetch metadata</strong>
          <div>
            <span className="setup-chip ready">
              {feed.lastFetchedAt ?? "Never fetched"}
            </span>
            <span className="setup-chip planned">
              {feed.lastFetchItemCount ?? 0} items
            </span>
            {feed.lastFetchErrorCode ? (
              <span className="setup-chip needs-setup">
                {feed.lastFetchErrorCode}
              </span>
            ) : null}
          </div>
        </div>
      ) : null}
      <form
        className="agent-form"
        onSubmit={(event) => {
          event.preventDefault();
          void onSave(form);
        }}
      >
        <fieldset disabled={!canManage || isSaving || isDeleting}>
          <label className="field">
            Name
            <input
              value={form.name}
              onChange={(event) =>
                setForm({ ...form, name: event.currentTarget.value })
              }
            />
          </label>
          <label className="field">
            URL
            <input
              value={form.url}
              placeholder="https://example.com/feed.xml"
              onChange={(event) =>
                setForm({ ...form, url: event.currentTarget.value })
              }
            />
          </label>
          <label className="field">
            Topic
            <input
              value={form.topic}
              placeholder="AI, product, security"
              onChange={(event) =>
                setForm({ ...form, topic: event.currentTarget.value })
              }
            />
          </label>
          <label className="field checkbox-field">
            <input
              checked={form.enabled}
              type="checkbox"
              onChange={(event) =>
                setForm({ ...form, enabled: event.currentTarget.checked })
              }
            />
            Enabled for briefings
          </label>
        </fieldset>
        {!canManage ? (
          <p className="permission-note">Members can inspect feeds only.</p>
        ) : null}
        {error ? (
          <p className="workspace-alert" role="alert">
            {error}
          </p>
        ) : null}
        <div className="form-actions">
          {onDelete ? (
            <button
              className="danger-button"
              type="button"
              disabled={!canManage || isDeleting}
              onClick={() => void onDelete()}
            >
              Delete
            </button>
          ) : null}
          {isNew ? (
            <button className="text-button" type="button" onClick={onCancel}>
              Cancel
            </button>
          ) : null}
          <button
            className="primary-button"
            type="submit"
            disabled={!canManage || isSaving}
          >
            Save feed
          </button>
        </div>
      </form>
    </section>
  );
}

function toFormState(feed: NewsFeed | null): NewsFeedFormState {
  return {
    name: feed?.name ?? "",
    url: feed?.url ?? "",
    topic: feed?.topic ?? "",
    enabled: feed?.enabled ?? true
  };
}

function toFeedInput(input: NewsFeedFormState): {
  name: string;
  url: string;
  topic: string | null;
  enabled: boolean;
} {
  return {
    name: input.name,
    url: input.url,
    topic: input.topic.trim() || null,
    enabled: input.enabled
  };
}
