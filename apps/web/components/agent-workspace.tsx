"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import type {
  AgentDefinition,
  CreateAgentDefinition,
  InstallAgentTemplatesResponse
} from "@devhub/contracts";

import { AgentForm } from "./agent-form";
import { AgentList } from "./agent-list";
import {
  createAgent,
  deleteAgent,
  installAgentTemplates,
  listAgents,
  listAgentTemplates,
  resetAgentTemplates,
  updateAgent
} from "@/lib/agents-api";
import { formatApiClientError } from "@/lib/api-client";

interface AgentWorkspaceProps {
  accessToken: string;
  canManage: boolean;
}

export function AgentWorkspace({
  accessToken,
  canManage
}: AgentWorkspaceProps): React.JSX.Element {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [templateResult, setTemplateResult] =
    useState<InstallAgentTemplatesResponse | null>(null);
  const agentsQuery = useQuery({
    queryKey: ["agents"],
    queryFn: () => listAgents(accessToken)
  });
  const templatesQuery = useQuery({
    queryKey: ["agent-templates"],
    queryFn: () => listAgentTemplates(accessToken)
  });
  const agents = agentsQuery.data ?? [];
  const selectedAgent =
    agents.find((agent) => agent.id === selectedId) ??
    (creating ? null : (agents[0] ?? null));
  const activeId = creating ? null : (selectedAgent?.id ?? null);

  const saveMutation = useMutation({
    mutationFn: async ({
      agent,
      input
    }: {
      agent: AgentDefinition | null;
      input: CreateAgentDefinition;
    }) =>
      agent
        ? updateAgent(accessToken, agent.id, input)
        : createAgent(accessToken, input),
    onSuccess: async (savedAgent) => {
      await queryClient.invalidateQueries({ queryKey: ["agents"] });
      setCreating(false);
      setSelectedId(savedAgent.id);
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (agentId: string) => deleteAgent(accessToken, agentId),
    onSuccess: async () => {
      setSelectedId(null);
      setCreating(false);
      await queryClient.invalidateQueries({ queryKey: ["agents"] });
    }
  });

  const installTemplatesMutation = useMutation({
    mutationFn: () => installAgentTemplates(accessToken),
    onSuccess: async (result) => {
      setTemplateResult(result);
      setSelectedId(result.installedAgentIds[0] ?? null);
      await queryClient.invalidateQueries({ queryKey: ["agents"] });
    }
  });

  const resetTemplatesMutation = useMutation({
    mutationFn: () => resetAgentTemplates(accessToken),
    onSuccess: async (result) => {
      setTemplateResult(result);
      setSelectedId(result.installedAgentIds[0] ?? null);
      await queryClient.invalidateQueries({ queryKey: ["agents"] });
    }
  });

  return (
    <section
      className="workspace agents-workspace"
      id="agents"
      aria-labelledby="workspace-title"
    >
      <div className="workspace-heading">
        <div>
          <p className="section-kicker">Agent configuration</p>
          <h1 id="workspace-title">Design the runtime before it runs.</h1>
          <p>
            Keep model choices, prompts, tools, knowledge, and safety limits
            explicit and reviewable.
          </p>
        </div>
        <div className="workspace-actions">
          <div className="environment-badge">
            <span className="status-dot" aria-hidden="true" />
            Local environment
          </div>
          {canManage ? (
            <div className="template-actions">
              <button
                className="secondary-button"
                type="button"
                disabled={
                  installTemplatesMutation.isPending ||
                  resetTemplatesMutation.isPending
                }
                onClick={() => void installTemplatesMutation.mutateAsync()}
              >
                Install templates
              </button>
              <button
                className="text-button"
                type="button"
                disabled={
                  installTemplatesMutation.isPending ||
                  resetTemplatesMutation.isPending
                }
                onClick={() => void resetTemplatesMutation.mutateAsync()}
              >
                Reset templates
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {templatesQuery.data ? (
        <div className="template-summary" aria-label="Default agent templates">
          {templatesQuery.data.data.map((template) => (
            <span key={template.key}>{template.name}</span>
          ))}
        </div>
      ) : null}

      {installTemplatesMutation.error || resetTemplatesMutation.error ? (
        <p className="workspace-alert" role="alert">
          {formatApiClientError(
            installTemplatesMutation.error ?? resetTemplatesMutation.error
          )}
        </p>
      ) : null}

      {templateResult ? (
        <p className="workspace-alert success" role="status">
          Templates: {templateResult.actionCounts.created} created,{" "}
          {templateResult.actionCounts.revived} revived,{" "}
          {templateResult.actionCounts.unchanged} unchanged,{" "}
          {templateResult.actionCounts.reset} reset.
        </p>
      ) : null}

      <div className="workspace-grid">
        <AgentList
          agents={agents}
          status={
            agentsQuery.isPending
              ? "loading"
              : agentsQuery.isError
                ? "error"
                : "success"
          }
          selectedId={activeId}
          canManage={canManage}
          onCreate={() => {
            setCreating(true);
            setSelectedId(null);
          }}
          onSelect={(agentId) => {
            setCreating(false);
            setSelectedId(agentId);
          }}
          onRetry={() => void agentsQuery.refetch()}
        />

        <AgentForm
          key={creating ? "new" : (selectedAgent?.id ?? "empty")}
          accessToken={accessToken}
          agent={creating ? null : selectedAgent}
          canManage={canManage}
          isNew={creating}
          isSaving={saveMutation.isPending}
          isDeleting={deleteMutation.isPending}
          saveError={
            saveMutation.error instanceof Error
              ? formatApiClientError(saveMutation.error)
              : null
          }
          onSave={(input) =>
            saveMutation.mutateAsync({
              agent: creating ? null : selectedAgent,
              input
            })
          }
          onDelete={
            selectedAgent
              ? () => deleteMutation.mutateAsync(selectedAgent.id)
              : undefined
          }
          onCancel={() => {
            setCreating(false);
            saveMutation.reset();
          }}
        />
      </div>
    </section>
  );
}
