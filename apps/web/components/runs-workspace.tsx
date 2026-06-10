"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient
} from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";

import type {
  AgentRun,
  AgentRunSnapshot,
  AgentRunStep,
  RealtimeEvent,
  UsageSummary
} from "@devhub/contracts";

import { listAgents } from "@/lib/agents-api";
import { createRealtimeClient } from "@/lib/realtime-client";
import { cancelRun, getRunSnapshot, listRuns, startRun } from "@/lib/runs-api";
import { getUsageSummary } from "@/lib/usage-api";

interface RunsWorkspaceProps {
  accessToken: string;
}

export function RunsWorkspace({
  accessToken
}: RunsWorkspaceProps): React.JSX.Element {
  const queryClient = useQueryClient();
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [message, setMessage] = useState(
    "Summarize the current workspace context."
  );
  const [rssUrl, setRssUrl] = useState("");
  const [agentId, setAgentId] = useState("");
  const [liveText, setLiveText] = useState<Record<string, string>>({});

  const agentsQuery = useQuery({
    queryKey: ["agents"],
    queryFn: () => listAgents(accessToken)
  });
  const runsQuery = useQuery({
    queryKey: ["runs"],
    queryFn: () => listRuns(accessToken)
  });
  const usageQuery = useQuery({
    queryKey: ["usage"],
    queryFn: () => getUsageSummary(accessToken)
  });
  const selectedRun =
    runsQuery.data?.find((run) => run.id === selectedRunId) ??
    runsQuery.data?.[0] ??
    null;
  const activeRunId = selectedRunId ?? selectedRun?.id ?? null;
  const snapshotQuery = useQuery({
    queryKey: ["run-snapshot", activeRunId],
    queryFn: () => getRunSnapshot(accessToken, activeRunId!),
    enabled: Boolean(activeRunId)
  });
  const snapshot = snapshotQuery.data ?? null;

  useEffect(() => {
    if (!agentId && agentsQuery.data?.[0]) {
      setAgentId(agentsQuery.data[0].id);
    }
  }, [agentId, agentsQuery.data]);

  const handleRealtimeEvent = useCallback(
    (event: RealtimeEvent): void => {
      applyRunEvent(queryClient, activeRunId, event);
      if (event.type === "agent_run.token_delta") {
        setLiveText((current) => ({
          ...current,
          [event.payload.stepId]:
            `${current[event.payload.stepId] ?? ""}${event.payload.text}`
        }));
      }
      if (
        event.type === "agent_run.status_changed" &&
        isTerminalRunStatus(event.payload.status)
      ) {
        void queryClient.invalidateQueries({ queryKey: ["usage"] });
      }
    },
    [activeRunId, queryClient]
  );

  useRunSubscription(accessToken, activeRunId, handleRealtimeEvent);

  const startMutation = useMutation({
    mutationFn: () =>
      startRun(accessToken, agentId, {
        message,
        retrievalLimit: 5,
        ...(rssUrl.trim() ? { rssUrl: rssUrl.trim() } : {})
      }),
    onSuccess: async (run) => {
      setSelectedRunId(run.id);
      await queryClient.invalidateQueries({ queryKey: ["runs"] });
      await queryClient.invalidateQueries({ queryKey: ["usage"] });
    }
  });

  const cancelMutation = useMutation({
    mutationFn: (runId: string) => cancelRun(accessToken, runId),
    onSuccess: async (run) => {
      await queryClient.setQueryData(["run-snapshot", run.id], (current) =>
        current ? { ...(current as AgentRunSnapshot), run } : current
      );
      await queryClient.invalidateQueries({ queryKey: ["runs"] });
    }
  });

  const steps = useMemo(
    () =>
      (snapshot?.steps ?? []).toSorted(
        (left, right) => left.sequence - right.sequence
      ),
    [snapshot?.steps]
  );

  return (
    <section className="workspace" id="runs" aria-labelledby="runs-title">
      <div className="workspace-heading">
        <div>
          <p className="section-kicker">Live timeline</p>
          <h1 id="runs-title">Watch the runtime think out loud.</h1>
          <p>
            Start a durable agent run, recover its snapshot over REST, and
            follow live step and token events over Socket.IO.
          </p>
        </div>
        <div className="environment-badge">
          <span className="status-dot" aria-hidden="true" />
          Reconnect safe
        </div>
      </div>

      <div className="workspace-grid">
        <aside className="agent-list-panel">
          <div className="panel-heading">
            <div>
              <p className="section-kicker">Runs</p>
              <h2>Recent runs</h2>
            </div>
          </div>
          <RunList
            runs={runsQuery.data ?? []}
            selectedId={activeRunId}
            onSelect={setSelectedRunId}
          />
        </aside>

        <div className="editor-panel">
          <div className="panel-heading editor-heading">
            <div>
              <p className="section-kicker">Execution</p>
              <h2>{snapshot?.run.status ?? "Ready"}</h2>
            </div>
            {snapshot?.run.status === "RUNNING" ||
            snapshot?.run.status === "QUEUED" ? (
              <button
                className="secondary-button"
                type="button"
                disabled={cancelMutation.isPending}
                onClick={() => void cancelMutation.mutate(snapshot.run.id)}
              >
                Cancel run
              </button>
            ) : null}
          </div>

          <form
            className="run-launcher"
            onSubmit={(event) => {
              event.preventDefault();
              void startMutation.mutate();
            }}
          >
            <label className="field">
              Agent
              <select
                value={agentId}
                onChange={(event) => setAgentId(event.target.value)}
                disabled={agentsQuery.isPending}
              >
                {(agentsQuery.data ?? []).map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Message
              <textarea
                value={message}
                rows={4}
                onChange={(event) => setMessage(event.target.value)}
              />
            </label>
            <label className="field">
              Optional RSS URL
              <input
                value={rssUrl}
                placeholder="https://example.com/feed.xml"
                onChange={(event) => setRssUrl(event.target.value)}
              />
            </label>
            <button
              className="primary-button"
              type="submit"
              disabled={!agentId || !message.trim() || startMutation.isPending}
            >
              Start run
            </button>
            {startMutation.error instanceof Error ? (
              <p role="alert">{startMutation.error.message}</p>
            ) : null}
          </form>

          <Timeline
            steps={steps}
            liveText={liveText}
            isLoading={snapshotQuery.isPending}
          />
          <UsagePanel
            usage={usageQuery.data ?? null}
            isLoading={usageQuery.isPending}
          />
        </div>
      </div>
    </section>
  );
}

function RunList({
  runs,
  selectedId,
  onSelect
}: {
  runs: readonly AgentRun[];
  selectedId: string | null;
  onSelect(runId: string): void;
}): React.JSX.Element {
  if (runs.length === 0) {
    return (
      <div className="panel-state">
        <p>No runs yet.</p>
        <span>Start a run to see the live timeline.</span>
      </div>
    );
  }
  return (
    <ul className="agent-list">
      {runs.map((run) => (
        <li key={run.id}>
          <button
            className={run.id === selectedId ? "selected" : ""}
            type="button"
            onClick={() => onSelect(run.id)}
          >
            <span className="agent-avatar" aria-hidden="true">
              {run.status.charAt(0)}
            </span>
            <span>
              <strong>{run.input.message}</strong>
              <small>{run.status.toLowerCase()}</small>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function Timeline({
  steps,
  liveText,
  isLoading
}: {
  steps: readonly AgentRunStep[];
  liveText: Readonly<Record<string, string>>;
  isLoading: boolean;
}): React.JSX.Element {
  if (isLoading) {
    return (
      <div className="panel-state">
        <span className="loader" aria-hidden="true" />
        <p>Loading run snapshot...</p>
      </div>
    );
  }
  if (steps.length === 0) {
    return (
      <div className="panel-state">
        <p>No steps recorded yet.</p>
        <span>
          The worker will publish timeline events once it starts the run.
        </span>
      </div>
    );
  }
  return (
    <ol className="timeline-list">
      {steps.map((step) => (
        <li
          key={step.id}
          className={`timeline-step ${step.status.toLowerCase()}`}
        >
          <span className="timeline-index">{step.sequence}</span>
          <div>
            <strong>{step.kind}</strong>
            <span>{step.status.toLowerCase()}</span>
            <p>
              {liveText[step.id] || step.outputPreview || step.inputPreview}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}

function UsagePanel({
  usage,
  isLoading
}: {
  usage: UsageSummary | null;
  isLoading: boolean;
}): React.JSX.Element {
  if (isLoading) {
    return (
      <section className="usage-panel" aria-busy="true">
        <p className="section-kicker">Usage</p>
        <span>Loading token and latency totals...</span>
      </section>
    );
  }

  if (!usage) {
    return (
      <section className="usage-panel">
        <p className="section-kicker">Usage</p>
        <span>No usage data yet.</span>
      </section>
    );
  }

  return (
    <section className="usage-panel" aria-labelledby="usage-title">
      <div className="panel-heading compact">
        <div>
          <p className="section-kicker">Usage</p>
          <h2 id="usage-title">Tenant budget view</h2>
        </div>
        <span>{formatMicros(usage.tenant.costMicros)}</span>
      </div>
      <div className="usage-stats">
        <UsageStat label="Tokens" value={usage.tenant.totalTokens} />
        <UsageStat label="Input" value={usage.tenant.inputTokens} />
        <UsageStat label="Output" value={usage.tenant.outputTokens} />
        <UsageStat label="Latency" value={`${usage.tenant.latencyMs} ms`} />
      </div>
      <UsageList
        title="By agent"
        rows={usage.agents.slice(0, 5)}
        getId={(row) => row.agentId}
      />
      <UsageList
        title="By run"
        rows={usage.runs.slice(0, 5)}
        getId={(row) => row.runId}
      />
    </section>
  );
}

function UsageStat({
  label,
  value
}: {
  label: string;
  value: number | string;
}): React.JSX.Element {
  return (
    <div>
      <span>{label}</span>
      <strong>
        {typeof value === "number" ? value.toLocaleString() : value}
      </strong>
    </div>
  );
}

function UsageList<T extends { totalTokens: number; latencyMs: number }>({
  title,
  rows,
  getId
}: {
  title: string;
  rows: readonly T[];
  getId(row: T): string;
}): React.JSX.Element {
  return (
    <div className="usage-list">
      <h3>{title}</h3>
      {rows.length === 0 ? (
        <span>No recorded usage.</span>
      ) : (
        <ol>
          {rows.map((row) => {
            const id = getId(row);
            return (
              <li key={id}>
                <code>{shortId(id)}</code>
                <span>
                  {row.totalTokens.toLocaleString()} tokens / {row.latencyMs} ms
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

function shortId(id: string): string {
  return id.slice(0, 8);
}

function formatMicros(costMicros: number): string {
  return `$${(costMicros / 1_000_000).toFixed(4)}`;
}

function isTerminalRunStatus(status: AgentRun["status"]): boolean {
  return ["COMPLETED", "FAILED", "CANCELLED", "TIMED_OUT"].includes(status);
}

function useRunSubscription(
  accessToken: string,
  runId: string | null,
  onEvent: (event: RealtimeEvent) => void
): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!runId) {
      return;
    }

    const client = createRealtimeClient(accessToken);
    const unsubscribe = client.onRunEvent(onEvent);
    const subscribe = (): void => {
      void client.subscribeToRun(runId).then((ack) => {
        if (ack.ok) {
          queryClient.setQueryData(["run-snapshot", runId], ack.snapshot);
        }
      });
      void queryClient.invalidateQueries({ queryKey: ["run-snapshot", runId] });
    };
    client.socket.on("connect", subscribe);
    if (client.socket.connected) {
      subscribe();
    }

    return () => {
      unsubscribe();
      client.socket.off("connect", subscribe);
      client.socket.disconnect();
    };
  }, [accessToken, onEvent, queryClient, runId]);
}

function applyRunEvent(
  queryClient: QueryClient,
  runId: string | null,
  event: RealtimeEvent
): void {
  if (!runId || event.payload.runId !== runId) {
    return;
  }
  queryClient.setQueryData<AgentRunSnapshot>(
    ["run-snapshot", runId],
    (current) => {
      if (!current) {
        return current;
      }
      if (event.type === "agent_run.status_changed") {
        return {
          ...current,
          run: {
            ...current.run,
            status: event.payload.status,
            errorCode: event.payload.errorCode ?? current.run.errorCode,
            errorMessage: event.payload.errorMessage ?? current.run.errorMessage
          }
        };
      }
      if (event.type === "agent_run.step_changed" && event.payload.step) {
        const step = event.payload.step;
        const existing = current.steps.filter((item) => item.id !== step.id);
        return { ...current, steps: [...existing, step] };
      }
      return current;
    }
  );
}
