import { usageSummarySchema, type UsageSummary } from "@devhub/contracts";

import { apiRequest } from "./api-client";

export function getUsageSummary(accessToken: string): Promise<UsageSummary> {
  return apiRequest("/usage", usageSummarySchema, { accessToken });
}
