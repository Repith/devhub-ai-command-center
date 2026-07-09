"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { listAgents } from "../lib/agents-api";
import { listGithubRepositories } from "../lib/github-api";
import { listNewsFeeds } from "../lib/news-api";
import { useDurableRunChat } from "../lib/use-durable-run-chat";
import { hasNewsIntent } from "./dashboard-home-helpers";

interface ChatWorkspaceProps {
  accessToken: string;
}

export function ChatWorkspace({
  accessToken
}: ChatWorkspaceProps): React.JSX.Element {
  const agents = useQuery({
    queryKey: ["agents", accessToken],
    queryFn: () => listAgents(accessToken)
  });
  const newsFeeds = useQuery({
    queryKey: ["news-feeds"],
    queryFn: () => listNewsFeeds(accessToken)
  });
  const [agentId, setAgentId] = useState("");
  const [draft, setDraft] = useState("");
  const chat = useDurableRunChat({ accessToken, agentId });
  const dailyNewsAgent =
    agents.data?.find((agent) => agent.templateKey === "daily-news-briefing") ??
    null;
  const enabledNewsFeeds = (newsFeeds.data ?? []).filter(
    (feed) => feed.enabled
  );
  const selectedAgent =
    agents.data?.find((agent) => agent.id === agentId) ?? null;
  const selectedAgentHasGithubTools =
    selectedAgent?.enabledToolIds.some((toolId) =>
      toolId.startsWith("github.")
    ) ?? false;
  const githubRepositories = useQuery({
    queryKey: ["github-repositories"],
    queryFn: () => listGithubRepositories(accessToken),
    enabled: selectedAgentHasGithubTools
  });

  useEffect(() => {
    if (!agentId && agents.data?.[0]) {
      setAgentId(agents.data[0].id);
    }
  }, [agentId, agents.data]);

  const send = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const message = draft.trim();
    if (!agentId || !message || chat.isRunning) {
      return;
    }
    setDraft("");
    await chat.send(
      message,
      hasNewsIntent(message) && dailyNewsAgent && enabledNewsFeeds.length > 0
        ? {
            agentId: dailyNewsAgent.id,
            input: {
              newsFeedIds: enabledNewsFeeds.slice(0, 10).map((feed) => feed.id),
              retrievalLimit: 5
            }
          }
        : undefined
    );
  };

  const startNewConversation = (): void => {
    void chat.cancel();
    chat.reset();
    setDraft("");
  };

  return (
    <section className="workspace chat-workspace" id="chat">
      <div className="workspace-heading">
        <div>
          <p className="section-kicker">Runtime chat</p>
          <h1>Chat over durable runs</h1>
          <p>
            Exercise the browser, API, worker, LangGraph, timeline and usage
            path from one diagnostic workspace.
          </p>
        </div>
        <button
          className="secondary-button"
          type="button"
          onClick={startNewConversation}
        >
          New conversation
        </button>
      </div>

      <div className="connection-grid" aria-label="Connection status">
        <article className="connection-card">
          <span
            className={`connection-indicator ${chat.realtimeStatus}`}
            aria-hidden="true"
          />
          <div>
            <strong>Socket.IO</strong>
            <span>{chat.realtimeStatus}</span>
          </div>
        </article>
        <article className="connection-card">
          <span
            className={`connection-indicator ${chat.isRunning ? "connecting" : chat.usage ? "connected" : "disconnected"}`}
            aria-hidden="true"
          />
          <div>
            <strong>Agent run</strong>
            <span>
              {chat.isRunning
                ? `running ${chat.currentRunId?.slice(0, 8) ?? ""}`
                : chat.terminalStatus
                  ? chat.terminalStatus.toLowerCase()
                  : "send a message to start"}
            </span>
          </div>
        </article>
      </div>

      <div className="chat-panel">
        <div className="chat-toolbar">
          <label className="field">
            Agent
            <select
              value={agentId}
              onChange={(event) => {
                setAgentId(event.target.value);
                chat.reset();
              }}
              disabled={agents.isPending || chat.isRunning}
            >
              {agents.data?.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name} / {agent.model}
                </option>
              ))}
            </select>
          </label>
          {chat.conversationId ? (
            <span className="conversation-id">
              Conversation {chat.conversationId.slice(0, 8)}
            </span>
          ) : null}
          {chat.currentRunId ? (
            <span className="conversation-id">
              Run {chat.currentRunId.slice(0, 8)}
            </span>
          ) : null}
        </div>

        {selectedAgent ? (
          <div className="agent-runtime-context">
            <div>
              <strong>Enabled tools</strong>
              <div>
                {selectedAgent.enabledToolIds.length ? (
                  selectedAgent.enabledToolIds.map((toolId) => (
                    <span className="setup-chip ready" key={toolId}>
                      {toolId}
                    </span>
                  ))
                ) : (
                  <span className="setup-chip planned">no tools</span>
                )}
              </div>
            </div>
            {selectedAgentHasGithubTools ? (
              <div>
                <strong>Available repositories</strong>
                <div>
                  {(githubRepositories.data ?? []).slice(0, 6).map((repo) => (
                    <span className="setup-chip ready" key={repo.id}>
                      {repo.fullName}
                    </span>
                  ))}
                  {githubRepositories.isPending ? (
                    <span className="setup-chip planned">loading repos</span>
                  ) : (githubRepositories.data ?? []).length === 0 ? (
                    <span className="setup-chip needs-setup">
                      no synced repos
                    </span>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="message-list" aria-live="polite">
          {chat.messages.length === 0 && !chat.assistantDraft ? (
            <div className="chat-empty">
              <strong>Ready for a durable round trip.</strong>
              <span>
                Your first message creates a conversation, starts an AgentRun,
                and streams worker progress back here.
              </span>
            </div>
          ) : null}
          {chat.messages.map((message) => (
            <article
              className={`chat-message ${message.role.toLowerCase()}`}
              key={message.id}
            >
              <span>{message.role === "USER" ? "You" : "Assistant"}</span>
              <p>{message.content}</p>
            </article>
          ))}
          {chat.assistantDraft ? (
            <article className="chat-message assistant streaming">
              <span>Assistant / streaming</span>
              <p>{chat.assistantDraft}</p>
            </article>
          ) : null}
        </div>

        {chat.error ? <p role="alert">{chat.error}</p> : null}
        {chat.usage ? (
          <p className="usage-line">
            {chat.usage.provider}/{chat.usage.model} / {chat.usage.inputTokens}{" "}
            input / {chat.usage.outputTokens} output tokens /{" "}
            {chat.usage.durationMs} ms
          </p>
        ) : null}

        <form className="chat-composer" onSubmit={(event) => void send(event)}>
          <label className="sr-only" htmlFor="chat-message">
            Message
          </label>
          <textarea
            id="chat-message"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Ask the selected agent something..."
            rows={3}
            disabled={!agentId || chat.isRunning}
          />
          {chat.isRunning ? (
            <button
              className="secondary-button"
              type="button"
              onClick={() => void chat.cancel()}
            >
              Cancel
            </button>
          ) : null}
          <button
            className="primary-button"
            type="submit"
            disabled={!agentId || !draft.trim() || chat.isRunning}
          >
            {chat.isRunning ? "Running" : "Send"}
          </button>
        </form>
      </div>
    </section>
  );
}
