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
  };
}

export class PrismaUsageRepository {
  public constructor(private readonly database: DatabaseClient) {}

  public async summarize(
    context: TenantContext,
    query: UsageSummaryQuery = { period: "30d" }
  ): Promise<UsageSummary> {
    const period = query.period;
    const startedAt = periodStart(period);
    const records = await this.database.tokenUsage.findMany({
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
            createdAt: true
          }
        }
      },
      orderBy: { createdAt: "desc" },
      take: 5000
    });

    return {
      period,
      generatedAt: new Date().toISOString(),
      tenant: sum(records),
      periods: groupByPeriod(records, period),
      agents: [...groupByAgent(records).values()].sort(byTokensDesc),
      runs: [...groupByRun(records).values()].sort(byTokensDesc),
      providerModels: [...groupByProviderModel(records).values()].sort(
        byTokensDesc
      ),
      recentExpensiveRuns: [...groupByRun(records).values()]
        .sort(byRunCreatedAtDescThenTokens)
        .slice(0, 10),
      budgetWarnings: budgetWarnings([...groupByRun(records).values()], records)
    };
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
    const current = map.get(record.agentRunId) ?? {
      runId: record.agentRunId,
      agentId: record.agentRun.agentId,
      status: record.agentRun.status,
      startedAt: record.agentRun.startedAt?.toISOString() ?? null,
      completedAt: record.agentRun.completedAt?.toISOString() ?? null,
      createdAt: record.agentRun.createdAt.toISOString(),
      ...emptyTotals()
    };
    map.set(record.agentRunId, addRecord(current, record));
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
