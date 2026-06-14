import {
  agentDefinitionListSchema,
  agentDefinitionSchema,
  agentWorkflowResponseSchema,
  agentWorkflowValidationResponseSchema,
  agentTemplateListSchema,
  installAgentTemplatesResponseSchema,
  type AgentDefinition,
  type AgentWorkflowDefinition,
  type AgentWorkflowResponse,
  type AgentWorkflowValidationResponse,
  type AgentTemplateList,
  type CreateAgentDefinition,
  type InstallAgentTemplatesResponse,
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

export function listAgentTemplates(
  accessToken: string
): Promise<AgentTemplateList> {
  return apiRequest("/agents/templates", agentTemplateListSchema, {
    accessToken
  });
}

export function installAgentTemplates(
  accessToken: string
): Promise<InstallAgentTemplatesResponse> {
  return apiRequest(
    "/agents/templates/install",
    installAgentTemplatesResponseSchema,
    {
      method: "POST",
      accessToken
    }
  );
}

export function resetAgentTemplates(
  accessToken: string
): Promise<InstallAgentTemplatesResponse> {
  return apiRequest(
    "/agents/templates/reset",
    installAgentTemplatesResponseSchema,
    {
      method: "POST",
      accessToken
    }
  );
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

export function getAgentWorkflow(
  accessToken: string,
  agentId: string
): Promise<AgentWorkflowResponse> {
  return apiRequest(
    `/agents/${agentId}/workflow`,
    agentWorkflowResponseSchema,
    { accessToken }
  );
}

export function validateAgentWorkflow(
  accessToken: string,
  agentId: string,
  definition: unknown
): Promise<AgentWorkflowValidationResponse> {
  return apiRequest(
    `/agents/${agentId}/workflow/validate`,
    agentWorkflowValidationResponseSchema,
    {
      method: "POST",
      accessToken,
      body: definition
    }
  );
}

export function saveAgentWorkflow(
  accessToken: string,
  agentId: string,
  definition: AgentWorkflowDefinition
): Promise<AgentWorkflowResponse> {
  return apiRequest(
    `/agents/${agentId}/workflow`,
    agentWorkflowResponseSchema,
    {
      method: "PUT",
      accessToken,
      body: { definition }
    }
  );
}
