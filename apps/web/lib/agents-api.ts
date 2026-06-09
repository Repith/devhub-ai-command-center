import {
  agentDefinitionListSchema,
  agentDefinitionSchema,
  type AgentDefinition,
  type CreateAgentDefinition,
  type UpdateAgentDefinition
} from "@devhub/contracts";

import { apiRequest, apiRequestEmpty } from "./api-client";

export async function listAgents(
  accessToken: string
): Promise<AgentDefinition[]> {
  const response = await apiRequest("/agents", agentDefinitionListSchema, {
    accessToken
  });
  return response.data;
}

export function createAgent(
  accessToken: string,
  input: CreateAgentDefinition
): Promise<AgentDefinition> {
  return apiRequest("/agents", agentDefinitionSchema, {
    method: "POST",
    accessToken,
    body: input
  });
}

export function updateAgent(
  accessToken: string,
  agentId: string,
  input: UpdateAgentDefinition
): Promise<AgentDefinition> {
  return apiRequest(`/agents/${agentId}`, agentDefinitionSchema, {
    method: "PATCH",
    accessToken,
    body: input
  });
}

export function deleteAgent(
  accessToken: string,
  agentId: string
): Promise<void> {
  return apiRequestEmpty(`/agents/${agentId}`, {
    method: "DELETE",
    accessToken
  });
}
