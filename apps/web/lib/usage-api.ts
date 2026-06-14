import {
  usageSummarySchema,
  type UsagePeriod,
  type UsageSummary
} from "@devhub/contracts";

import { apiRequest } from "./api-client";

export function getUsageSummary(
  accessToken: string,
  period: UsagePeriod = "30d"
): Promise<UsageSummary> {
  return apiRequest(
    `/usage?period=${encodeURIComponent(period)}`,
    usageSummarySchema,
    {
      accessToken
    }
  );
}
