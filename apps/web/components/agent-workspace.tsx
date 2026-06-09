"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import type { AgentDefinition, CreateAgentDefinition } from "@devhub/contracts";

import { AgentForm } from "./agent-form";
import { AgentList } from "./agent-list";
import {
  createAgent,
  deleteAgent,
  listAgents,
  updateAgent
} from "@/lib/agents-api";

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
  const agentsQuery = useQuery({
    queryKey: ["agents"],
    queryFn: () => listAgents(accessToken)
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

  return (
    <section
      className="workspace"
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
        <div className="environment-badge">
          <span className="status-dot" aria-hidden="true" />
          Local environment
        </div>
      </div>

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
          agent={creating ? null : selectedAgent}
          canManage={canManage}
          isNew={creating}
          isSaving={saveMutation.isPending}
          isDeleting={deleteMutation.isPending}
          saveError={
            saveMutation.error instanceof Error
              ? saveMutation.error.message
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
