"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { EvaluationsWorkspace } from "./evaluations-workspace";
import { RunsWorkspace, UsagePanel } from "./runs-workspace";
import type { UsagePeriod } from "@devhub/contracts";

import { getUsageSummary } from "@/lib/usage-api";

interface AnalyticsWorkspaceProps {
  accessToken: string;
}

type AnalyticsTab = "activity" | "usage" | "quality";

export function AnalyticsWorkspace({
  accessToken
}: AnalyticsWorkspaceProps): React.JSX.Element {
  const [tab, setTab] = useState<AnalyticsTab>("usage");
  const [usagePeriod, setUsagePeriod] = useState<UsagePeriod>("30d");
  const usageQuery = useQuery({
    queryKey: ["usage", usagePeriod],
    queryFn: () => getUsageSummary(accessToken, usagePeriod),
    enabled: tab === "usage"
  });

  return (
    <section
      className="workspace"
      id="analytics"
      aria-labelledby="analytics-title"
    >
      <div className="workspace-heading">
        <div>
          <p className="section-kicker">Analytics</p>
          <h1 id="analytics-title">Track activity, tokens, and quality.</h1>
          <p>
            Usage is the default operational dashboard. Runs contains durable
            timelines, while Quality contains explicit golden-case evaluations.
          </p>
        </div>
        <div className="usage-heading-actions" role="tablist">
          <button
            className={
              tab === "activity" ? "primary-button" : "secondary-button"
            }
            type="button"
            role="tab"
            aria-selected={tab === "activity"}
            onClick={() => setTab("activity")}
          >
            Runs
          </button>
          <button
            className={tab === "usage" ? "primary-button" : "secondary-button"}
            type="button"
            role="tab"
            aria-selected={tab === "usage"}
            onClick={() => setTab("usage")}
          >
            Usage dashboard
          </button>
          <button
            className={
              tab === "quality" ? "primary-button" : "secondary-button"
            }
            type="button"
            role="tab"
            aria-selected={tab === "quality"}
            onClick={() => setTab("quality")}
          >
            Quality
          </button>
        </div>
      </div>
      {tab === "activity" ? (
        <RunsWorkspace accessToken={accessToken} embedded showUsage={false} />
      ) : tab === "usage" ? (
        <UsagePanel
          usage={usageQuery.data ?? null}
          isLoading={usageQuery.isPending}
          period={usagePeriod}
          onPeriodChange={setUsagePeriod}
        />
      ) : (
        <EvaluationsWorkspace accessToken={accessToken} embedded />
      )}
    </section>
  );
}
