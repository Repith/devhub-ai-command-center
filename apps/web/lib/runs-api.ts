import {
  agentRunListSchema,
  agentRunSchema,
  agentRunSnapshotSchema,
  createAgentRunSchema,
  type AgentRun,
  type AgentRunSnapshot,
  type CreateAgentRun
} from "@devhub/contracts";

import { apiRequest } from "./api-client";

export async function listRuns(accessToken: string): Promise<AgentRun[]> {
  const response = await apiRequest("/runs", agentRunListSchema, {
    accessToken
  });
  return response.data;
}

export function getRunSnapshot(
  accessToken: string,
  runId: string
): Promise<AgentRunSnapshot> {
  return apiRequest(`/runs/${runId}`, agentRunSnapshotSchema, {
    accessToken
  });
}

export function startRun(
  accessToken: string,
  agentId: string,
  input: CreateAgentRun
): Promise<AgentRun> {
  return apiRequest(`/agents/${agentId}/runs`, agentRunSchema, {
    method: "POST",
    accessToken,
    body: createAgentRunSchema.parse(input)
  });
}

export function cancelRun(
  accessToken: string,
  runId: string
): Promise<AgentRun> {
  return apiRequest(`/runs/${runId}/cancel`, agentRunSchema, {
    method: "POST",
    accessToken
  });
}
