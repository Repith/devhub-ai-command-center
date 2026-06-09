import type { AgentDefinition } from "@devhub/contracts";

interface AgentListProps {
  agents: AgentDefinition[];
  status: "loading" | "error" | "success";
  selectedId: string | null;
  canManage: boolean;
  onSelect(agentId: string): void;
  onCreate(): void;
  onRetry(): void;
}

export function AgentList({
  agents,
  status,
  selectedId,
  canManage,
  onSelect,
  onCreate,
  onRetry
}: AgentListProps): React.JSX.Element {
  return (
    <section className="agent-list-panel" aria-labelledby="agent-list-heading">
      <div className="panel-heading">
        <div>
          <p className="section-kicker">Definitions</p>
          <h2 id="agent-list-heading">Agents</h2>
        </div>
        {canManage ? (
          <button className="icon-button" type="button" onClick={onCreate}>
            <span aria-hidden="true">+</span>
            <span className="sr-only">Create agent</span>
          </button>
        ) : null}
      </div>

      {status === "loading" ? (
        <div className="panel-state" aria-busy="true">
          <span className="loader" aria-hidden="true" />
          <p>Loading agent definitions…</p>
        </div>
      ) : null}

      {status === "error" ? (
        <div className="panel-state" role="alert">
          <p>Agent definitions could not be loaded.</p>
          <button className="secondary-button" type="button" onClick={onRetry}>
            Try again
          </button>
        </div>
      ) : null}

      {status === "success" && agents.length === 0 ? (
        <div className="panel-state">
          <p>No agents yet.</p>
          <span>
            {canManage
              ? "Create the first explicit agent configuration."
              : "An owner or admin can create agent definitions."}
          </span>
          {canManage ? (
            <button
              className="secondary-button"
              type="button"
              onClick={onCreate}
            >
              Create agent
            </button>
          ) : null}
        </div>
      ) : null}

      {status === "success" && agents.length > 0 ? (
        <ul className="agent-list">
          {agents.map((agent) => (
            <li key={agent.id}>
              <button
                type="button"
                className={agent.id === selectedId ? "selected" : ""}
                aria-pressed={agent.id === selectedId}
                onClick={() => onSelect(agent.id)}
              >
                <span className="agent-avatar" aria-hidden="true">
                  {agent.name.charAt(0).toUpperCase()}
                </span>
                <span>
                  <strong>{agent.name}</strong>
                  <small>
                    {agent.provider} / {agent.model}
                  </small>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
