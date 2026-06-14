import type {
  UsageSummaryToolInput,
  UsageSummaryToolOutput
} from "@devhub/contracts";
import {
  usageSummaryToolInputSchema,
  usageSummaryToolOutputSchema
} from "@devhub/contracts";
import type { TenantContext } from "@devhub/domain";

import type { ToolDefinition } from "./tool-registry.js";

export interface UsageSummaryToolDependencies {
  usage: {
    summarize(
      context: TenantContext,
      input: UsageSummaryToolInput
    ): Promise<UsageSummaryToolOutput>;
  };
}

export function createUsageSummaryTool(
  dependencies: UsageSummaryToolDependencies
): ToolDefinition<UsageSummaryToolInput, UsageSummaryToolOutput> {
  return {
    id: "usage.summary",
    description:
      "Returns persisted token usage, latency, budget warnings, and provider/model totals for the current tenant.",
    inputSchema: usageSummaryToolInputSchema,
    outputSchema: usageSummaryToolOutputSchema,
    execute: (input, context) => dependencies.usage.summarize(context, input)
  };
}
