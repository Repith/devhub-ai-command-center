import type {
  AgentRunConfigSnapshot,
  UsageByAgent,
  UsageByProviderModel,
  UsageByRun,
  UsageBudgetWarning,
  UsagePeriod,
  UsagePeriodBucket,
  UsageSummaryQuery,
  UsageSummary,
  UsageTotals
} from "@devhub/contracts";
import { agentRunConfigSnapshotSchema } from "@devhub/contracts";
import type { TenantContext } from "@devhub/domain";

import type { DatabaseClient } from "./client.js";

interface UsageRecord {
  id: string;
  agentRunId: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costMicros: bigint;
  latencyMs: number;
  retryCount: number;
  createdAt: Date;
  agentRun: {
    agentId: string;
    status: string;
    configSnapshot: unknown;
    startedAt: Date | null;
    completedAt: Date | null;
    createdAt: Date;
    steps: readonly {
      kind: string;
      status: string;
      outputPreview: string | null;
    }[];
  };
}

const usageSummaryPageSize = 1000;
const usageSummaryRecordLimit = 5000;

export class PrismaUsageRepository {
  public constructor(private readonly database: DatabaseClient) {}

  public async summarize(
    context: TenantContext,
    query: UsageSummaryQuery = { period: "30d" }
  ): Promise<UsageSummary> {
    const period = query.period;
    const startedAt = periodStart(period);
    const records = await this.listUsageRecords(context, startedAt);
    const runs = [...groupByRun(records).values()].sort(byTokensDesc);

    return {
      period,
      generatedAt: new Date().toISOString(),
      tenant: sum(records),
      periods: groupByPeriod(records, period),
      agents: [...groupByAgent(records).values()].sort(byTokensDesc),
      runs,
      providerModels: [...groupByProviderModel(records).values()].sort(
        byTokensDesc
      ),
      recentExpensiveRuns: [...runs]
        .sort(byRunCreatedAtDescThenTokens)
        .slice(0, 10),
      budgetWarnings: budgetWarnings(runs, records)
    };
  }

  private async listUsageRecords(
    context: TenantContext,
    startedAt: Date | null
  ): Promise<UsageRecord[]> {
    const records: UsageRecord[] = [];
    let cursor: { id: string } | undefined;
    while (records.length < usageSummaryRecordLimit) {
      const remaining = usageSummaryRecordLimit - records.length;
      const page = await this.database.tokenUsage.findMany({
        where: {
          tenantId: context.tenantId,
          ...(startedAt ? { createdAt: { gte: startedAt } } : {})
        },
        include: {
          agentRun: {
            select: {
              agentId: true,
              status: true,
              configSnapshot: true,
              startedAt: true,
              completedAt: true,
              createdAt: true,
              steps: {
                select: {
                  kind: true,
                  status: true,
                  outputPreview: true
                },
                orderBy: { sequence: "asc" }
              }
            }
          }
        },
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        take: Math.min(usageSummaryPageSize, remaining),
        ...(cursor ? { cursor, skip: 1 } : {})
      });
      records.push(...page);
      if (page.length < Math.min(usageSummaryPageSize, remaining)) {
        break;
      }
      cursor = { id: page[page.length - 1]!.id };
    }
    return records;
  }
}

function groupByAgent(
  records: readonly UsageRecord[]
): Map<string, UsageByAgent> {
  const map = new Map<string, UsageByAgent>();
  for (const record of records) {
    const current = map.get(record.agentRun.agentId) ?? {
      agentId: record.agentRun.agentId,
      ...emptyTotals()
    };
    map.set(record.agentRun.agentId, addRecord(current, record));
  }
  return map;
}

function groupByRun(records: readonly UsageRecord[]): Map<string, UsageByRun> {
  const map = new Map<string, UsageByRun>();
  for (const record of records) {
    const observability = runObservability(record.agentRun.configSnapshot);
    const current = map.get(record.agentRunId) ?? {
      runId: record.agentRunId,
      agentId: record.agentRun.agentId,
      templateKey: observability.templateKey,
      workflowVersion: observability.workflowVersion,
      toolCallsUsed: countToolCalls(record.agentRun.steps),
      retrievalHit: countRetrievalHits(record.agentRun.steps) > 0,
      retrievalHitCount: countRetrievalHits(record.agentRun.steps),
      finalAnswerTokens: 0,
      modelLatencyMs: 0,
      status: record.agentRun.status,
      startedAt: record.agentRun.startedAt?.toISOString() ?? null,
      completedAt: record.agentRun.completedAt?.toISOString() ?? null,
      createdAt: record.agentRun.createdAt.toISOString(),
      ...emptyTotals()
    };
    const next = addRecord(current, record);
    map.set(record.agentRunId, {
      ...next,
      finalAnswerTokens: next.outputTokens,
      modelLatencyMs: next.latencyMs
    });
  }
  return map;
}

function groupByProviderModel(
  records: readonly UsageRecord[]
): Map<string, UsageByProviderModel> {
  const map = new Map<string, UsageByProviderModel>();
  for (const record of records) {
    const key = `${record.provider}\u0000${record.model}`;
    const current = map.get(key) ?? {
      provider: record.provider,
      model: record.model,
      ...emptyTotals()
    };
    map.set(key, addRecord(current, record));
  }
  return map;
}

function groupByPeriod(
  records: readonly UsageRecord[],
  period: UsagePeriod
): UsagePeriodBucket[] {
  const map = new Map<string, UsagePeriodBucket>();
  for (const record of records) {
    const start = bucketStart(record.createdAt, period);
    const end = bucketEnd(start, period);
    const current = map.get(start.toISOString()) ?? {
      periodStart: start.toISOString(),
      periodEnd: end.toISOString(),
      ...emptyTotals()
    };
    map.set(start.toISOString(), addRecord(current, record));
  }
  return [...map.values()].sort((left, right) =>
    left.periodStart.localeCompare(right.periodStart)
  );
}

function sum(records: readonly UsageRecord[]): UsageTotals {
  return records.reduce<UsageTotals>(
    (current, record) => addRecord(current, record),
    emptyTotals()
  );
}

function emptyTotals(): UsageTotals {
  return {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    costMicros: 0,
    latencyMs: 0,
    retryCount: 0
  };
}

function addRecord<T extends UsageTotals>(current: T, record: UsageRecord): T {
  const inputTokens = current.inputTokens + record.inputTokens;
  const outputTokens = current.outputTokens + record.outputTokens;
  return {
    ...current,
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    costMicros: current.costMicros + Number(record.costMicros),
    latencyMs: current.latencyMs + record.latencyMs,
    retryCount: current.retryCount + record.retryCount
  };
}

function byTokensDesc(left: UsageTotals, right: UsageTotals): number {
  return right.totalTokens - left.totalTokens;
}

function byRunCreatedAtDescThenTokens(
  left: UsageByRun,
  right: UsageByRun
): number {
  const createdAt = right.createdAt.localeCompare(left.createdAt);
  return createdAt === 0 ? byTokensDesc(left, right) : createdAt;
}

function budgetWarnings(
  runs: readonly UsageByRun[],
  records: readonly UsageRecord[]
): UsageBudgetWarning[] {
  const configByRun = new Map<string, AgentRunConfigSnapshot>();
  for (const record of records) {
    if (configByRun.has(record.agentRunId)) {
      continue;
    }
    const parsed = agentRunConfigSnapshotSchema.safeParse(
      record.agentRun.configSnapshot
    );
    if (parsed.success) {
      configByRun.set(record.agentRunId, parsed.data);
    }
  }
  return runs
    .map((run) => warningForRun(run, configByRun.get(run.runId)))
    .filter((warning): warning is UsageBudgetWarning => Boolean(warning))
    .sort((left, right) => right.percentUsed - left.percentUsed)
    .slice(0, 10);
}

function warningForRun(
  run: UsageByRun,
  config: AgentRunConfigSnapshot | undefined
): UsageBudgetWarning | null {
  if (!config?.maxTokens) {
    return null;
  }
  const percentUsed = Math.round((run.totalTokens / config.maxTokens) * 100);
  if (percentUsed < 80) {
    return null;
  }
  return {
    runId: run.runId,
    agentId: run.agentId,
    level: percentUsed >= 100 ? "OVER_BUDGET" : "NEAR_BUDGET",
    maxTokens: config.maxTokens,
    totalTokens: run.totalTokens,
    percentUsed,
    createdAt: run.createdAt
  };
}

function runObservability(
  configSnapshot: unknown
): Pick<UsageByRun, "templateKey" | "workflowVersion"> {
  const parsed = agentRunConfigSnapshotSchema.safeParse(configSnapshot);
  if (!parsed.success) {
    return fallbackRunObservability(configSnapshot);
  }
  return {
    templateKey: parsed.data.templateKey ?? null,
    workflowVersion: parsed.data.workflowVersion ?? null
  };
}

function fallbackRunObservability(
  configSnapshot: unknown
): Pick<UsageByRun, "templateKey" | "workflowVersion"> {
  if (!configSnapshot || typeof configSnapshot !== "object") {
    return { templateKey: null, workflowVersion: null };
  }
  const snapshot = configSnapshot as {
    templateKey?: unknown;
    workflowVersion?: unknown;
  };
  return {
    templateKey: isKnownTemplateKey(snapshot.templateKey)
      ? snapshot.templateKey
      : null,
    workflowVersion:
      typeof snapshot.workflowVersion === "number" &&
      Number.isInteger(snapshot.workflowVersion) &&
      snapshot.workflowVersion > 0
        ? snapshot.workflowVersion
        : null
  };
}

function isKnownTemplateKey(
  value: unknown
): value is NonNullable<UsageByRun["templateKey"]> {
  return (
    value === "knowledge-researcher" ||
    value === "daily-news-briefing" ||
    value === "gmail-triage" ||
    value === "gmail-reply-assistant" ||
    value === "usage-analyst"
  );
}

function countToolCalls(steps: UsageRecord["agentRun"]["steps"]): number {
  return steps.filter(
    (step) =>
      step.status === "COMPLETED" &&
      (step.kind === "rag.retrieve" ||
        step.kind.startsWith("mcp.") ||
        step.kind === "usage.summary" ||
        step.kind === "gmail.draft_review")
  ).length;
}

function countRetrievalHits(steps: UsageRecord["agentRun"]["steps"]): number {
  return steps.reduce((count, step) => {
    if (
      step.kind !== "rag.retrieve" ||
      step.status !== "COMPLETED" ||
      !step.outputPreview
    ) {
      return count;
    }
    const parsed = parsePreviewJson(step.outputPreview);
    if (parsed && Array.isArray(parsed.sources)) {
      return count + parsed.sources.length;
    }
    if (parsed && Array.isArray(parsed.citations)) {
      return count + parsed.citations.length;
    }
    if (parsed && Array.isArray(parsed.chunks)) {
      return count + parsed.chunks.length;
    }
    return count + 1;
  }, 0);
}

function parsePreviewJson(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function periodStart(period: UsagePeriod): Date | null {
  const now = new Date();
  if (period === "24h") {
    return new Date(now.getTime() - 24 * 60 * 60 * 1000);
  }
  if (period === "7d") {
    return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  }
  if (period === "30d") {
    return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  }
  return null;
}

function bucketStart(date: Date, period: UsagePeriod): Date {
  const start = new Date(date);
  start.setUTCMinutes(0, 0, 0);
  if (period !== "24h") {
    start.setUTCHours(0, 0, 0, 0);
  }
  return start;
}

function bucketEnd(start: Date, period: UsagePeriod): Date {
  const durationMs = period === "24h" ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
  return new Date(start.getTime() + durationMs);
}
