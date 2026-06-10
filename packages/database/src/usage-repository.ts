import type {
  UsageByAgent,
  UsageByRun,
  UsageSummary,
  UsageTotals
} from "@devhub/contracts";
import type { TenantContext } from "@devhub/domain";

import type { DatabaseClient } from "./client.js";

interface UsageRecord {
  agentRunId: string;
  inputTokens: number;
  outputTokens: number;
  costMicros: bigint;
  latencyMs: number;
  retryCount: number;
  agentRun: { agentId: string };
}

export class PrismaUsageRepository {
  public constructor(private readonly database: DatabaseClient) {}

  public async summarize(context: TenantContext): Promise<UsageSummary> {
    const records = await this.database.tokenUsage.findMany({
      where: { tenantId: context.tenantId },
      include: { agentRun: { select: { agentId: true } } },
      orderBy: { createdAt: "desc" },
      take: 5000
    });

    return {
      tenant: sum(records),
      agents: [...groupByAgent(records).values()].sort(byTokensDesc),
      runs: [...groupByRun(records).values()].sort(byTokensDesc)
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
      ...emptyTotals()
    };
    map.set(record.agentRunId, addRecord(current, record));
  }
  return map;
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
