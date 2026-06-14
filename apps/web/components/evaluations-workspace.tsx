"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import type {
  EvaluationMode,
  EvaluationReport,
  EvaluationRun
} from "@devhub/contracts";

import {
  getEvaluationReport,
  listEvaluationRuns,
  startGoldenEvaluation
} from "@/lib/golden-api";

interface EvaluationsWorkspaceProps {
  accessToken: string;
}

export function EvaluationsWorkspace({
  accessToken
}: EvaluationsWorkspaceProps): React.JSX.Element {
  const queryClient = useQueryClient();
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const runsQuery = useQuery({
    queryKey: ["evaluations"],
    queryFn: () => listEvaluationRuns(accessToken)
  });
  const selectedRun =
    runsQuery.data?.find((run) => run.id === selectedRunId) ??
    runsQuery.data?.[0] ??
    null;
  const activeRunId = selectedRunId ?? selectedRun?.id ?? null;
  const reportQuery = useQuery({
    queryKey: ["evaluation-report", activeRunId],
    queryFn: () => getEvaluationReport(accessToken, activeRunId!),
    enabled: Boolean(activeRunId)
  });
  const startMutation = useMutation({
    mutationFn: (mode: EvaluationMode) =>
      startGoldenEvaluation(accessToken, mode),
    onSuccess: async (run) => {
      setSelectedRunId(run.id);
      await queryClient.invalidateQueries({ queryKey: ["evaluations"] });
      await queryClient.invalidateQueries({
        queryKey: ["evaluation-report", run.id]
      });
    }
  });
  const report = reportQuery.data ?? null;
  const summary = useMemo(() => summarizeReport(report), [report]);

  return (
    <section
      className="workspace"
      id="evaluations"
      aria-labelledby="evaluations-title"
    >
      <div className="workspace-heading">
        <div>
          <p className="section-kicker">Golden set</p>
          <h1 id="evaluations-title">Evaluate the runtime path.</h1>
          <p>
            Compare fast LLM-only scoring with the full durable agent runtime.
          </p>
        </div>
        <div className="environment-badge">
          <span className="status-dot" aria-hidden="true" />
          Repeatable reports
        </div>
      </div>

      <div className="workspace-grid">
        <aside className="agent-list-panel">
          <div className="panel-heading">
            <div>
              <p className="section-kicker">Runs</p>
              <h2>Evaluation history</h2>
            </div>
          </div>
          <EvaluationRunList
            runs={runsQuery.data ?? []}
            selectedId={activeRunId}
            onSelect={setSelectedRunId}
          />
        </aside>

        <div className="editor-panel">
          <div className="panel-heading editor-heading">
            <div>
              <p className="section-kicker">Report</p>
              <h2>{selectedRun?.status ?? "Ready"}</h2>
            </div>
            <div className="usage-heading-actions">
              <button
                className="secondary-button"
                type="button"
                disabled={startMutation.isPending}
                onClick={() => void startMutation.mutate("FAST_LLM_ONLY")}
              >
                Fast
              </button>
              <button
                className="primary-button"
                type="button"
                disabled={startMutation.isPending}
                onClick={() => void startMutation.mutate("FULL_AGENT_RUNTIME")}
              >
                Full runtime
              </button>
            </div>
          </div>

          {startMutation.error instanceof Error ? (
            <p role="alert">{startMutation.error.message}</p>
          ) : null}

          <EvaluationSummary
            summary={summary}
            isLoading={reportQuery.isPending}
          />
          <EvaluationResults
            report={report}
            isLoading={reportQuery.isPending}
          />
        </div>
      </div>
    </section>
  );
}

function EvaluationRunList({
  runs,
  selectedId,
  onSelect
}: {
  runs: readonly EvaluationRun[];
  selectedId: string | null;
  onSelect(runId: string): void;
}): React.JSX.Element {
  if (runs.length === 0) {
    return (
      <div className="panel-state">
        <p>No evaluations yet.</p>
        <span>Run the golden set to create the first report.</span>
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
              <strong>{run.mode.replaceAll("_", " ").toLowerCase()}</strong>
              <small>{run.status.toLowerCase()}</small>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function EvaluationSummary({
  summary,
  isLoading
}: {
  summary: EvaluationSummaryValue | null;
  isLoading: boolean;
}): React.JSX.Element {
  if (isLoading) {
    return (
      <section className="usage-panel" aria-busy="true">
        <p className="section-kicker">Summary</p>
        <span>Loading report...</span>
      </section>
    );
  }
  if (!summary) {
    return (
      <section className="usage-panel">
        <p className="section-kicker">Summary</p>
        <span>Select or start an evaluation.</span>
      </section>
    );
  }
  return (
    <section className="usage-panel" aria-labelledby="evaluation-summary-title">
      <div className="panel-heading compact">
        <div>
          <p className="section-kicker">Summary</p>
          <h2 id="evaluation-summary-title">{summary.mode}</h2>
        </div>
        <span>
          {summary.passed}/{summary.total} passed
        </span>
      </div>
      <div className="usage-stats">
        <EvaluationStat label="Score" value={summary.score.toFixed(3)} />
        <EvaluationStat label="Tokens" value={summary.tokens} />
        <EvaluationStat label="Tool calls" value={summary.toolCalls} />
        <EvaluationStat label="Latency" value={`${summary.latencyMs} ms`} />
      </div>
    </section>
  );
}

function EvaluationResults({
  report,
  isLoading
}: {
  report: EvaluationReport | null;
  isLoading: boolean;
}): React.JSX.Element {
  if (isLoading || !report) {
    return <div className="panel-state">No result rows loaded.</div>;
  }
  if (report.results.length === 0) {
    return (
      <div className="panel-state">
        <p>No results yet.</p>
        <span>The worker will add rows as cases finish.</span>
      </div>
    );
  }
  return (
    <ol className="timeline-list">
      {report.results.map((result, index) => (
        <li
          key={result.id}
          className={`timeline-step ${result.passed ? "completed" : "failed"}`}
        >
          <span className="timeline-index">{index + 1}</span>
          <div>
            <strong>{result.passed ? "Passed" : "Failed"}</strong>
            <span>
              {result.mode.toLowerCase()} / score {result.score.toFixed(3)}
            </span>
            <p>{result.details.answerPreview}</p>
            <small>
              {result.terminalStatus ?? "llm-only"} ·{" "}
              {result.agentRunId?.slice(0, 8) ?? "no run"} ·{" "}
              {result.toolCallsUsed} tools
            </small>
          </div>
        </li>
      ))}
    </ol>
  );
}

function EvaluationStat({
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

interface EvaluationSummaryValue {
  latencyMs: number;
  mode: string;
  passed: number;
  score: number;
  tokens: number;
  toolCalls: number;
  total: number;
}

function summarizeReport(
  report: EvaluationReport | null
): EvaluationSummaryValue | null {
  if (!report) {
    return null;
  }
  const total = report.results.length;
  return {
    latencyMs: report.results.reduce((sum, row) => sum + row.latencyMs, 0),
    mode: report.run.mode.replaceAll("_", " ").toLowerCase(),
    passed: report.results.filter((row) => row.passed).length,
    score:
      total === 0
        ? 0
        : report.results.reduce((sum, row) => sum + row.score, 0) / total,
    tokens: report.results.reduce(
      (sum, row) => sum + row.inputTokens + row.outputTokens,
      0
    ),
    toolCalls: report.results.reduce((sum, row) => sum + row.toolCallsUsed, 0),
    total
  };
}
