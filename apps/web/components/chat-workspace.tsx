"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import type { ChatUsage, ConversationMessage } from "@devhub/contracts";

import { listAgents } from "../lib/agents-api";
import { streamChat } from "../lib/chat-api";
import {
  createRealtimeClient,
  type RealtimeConnectionStatus,
  type RealtimeClient
} from "../lib/realtime-client";
import { ChatMarkdown } from "./chat-markdown";

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
  const [agentId, setAgentId] = useState("");
  const [conversationId, setConversationId] = useState<string>();
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [assistantDraft, setAssistantDraft] = useState("");
  const [usage, setUsage] = useState<ChatUsage>();
  const [error, setError] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [realtimeStatus, setRealtimeStatus] =
    useState<RealtimeConnectionStatus>("connecting");
  const [latencyMs, setLatencyMs] = useState<number>();
  const realtime = useRef<RealtimeClient | null>(null);
  const abortController = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!agentId && agents.data?.[0]) {
      setAgentId(agents.data[0].id);
    }
  }, [agentId, agents.data]);

  useEffect(() => {
    const client = createRealtimeClient(accessToken);
    realtime.current = client;
    const runProbe = async (): Promise<void> => {
      try {
        const result = await client.probe();
        if (result.ack.ok) {
          setLatencyMs(result.latencyMs);
        } else {
          setRealtimeStatus("error");
        }
      } catch {
        setRealtimeStatus("error");
      }
    };
    client.socket.on("connect", () => {
      setRealtimeStatus("connected");
      void runProbe();
    });
    client.socket.on("disconnect", () => setRealtimeStatus("disconnected"));
    client.socket.on("connect_error", () => setRealtimeStatus("error"));

    return () => {
      client.socket.disconnect();
      realtime.current = null;
    };
  }, [accessToken]);

  useEffect(
    () => () => {
      abortController.current?.abort();
    },
    []
  );

  const testRealtime = async (): Promise<void> => {
    if (!realtime.current?.socket.connected) {
      realtime.current?.socket.connect();
      setRealtimeStatus("connecting");
      return;
    }
    try {
      const result = await realtime.current.probe();
      if (result.ack.ok) {
        setLatencyMs(result.latencyMs);
        setRealtimeStatus("connected");
      } else {
        setRealtimeStatus("error");
      }
    } catch {
      setRealtimeStatus("error");
    }
  };

  const send = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const message = draft.trim();
    if (!agentId || !message || isStreaming) {
      return;
    }

    const controller = new AbortController();
    abortController.current = controller;
    setDraft("");
    setAssistantDraft("");
    setUsage(undefined);
    setError("");
    setIsStreaming(true);
    try {
      await streamChat(
        accessToken,
        agentId,
        { message, ...(conversationId ? { conversationId } : {}) },
        (chatEvent) => {
          if (chatEvent.type === "chat.started") {
            setConversationId(chatEvent.conversationId);
            setMessages((current) => [...current, chatEvent.userMessage]);
          } else if (chatEvent.type === "chat.delta") {
            setAssistantDraft((current) => current + chatEvent.text);
          } else if (chatEvent.type === "chat.completed") {
            setMessages((current) => [...current, chatEvent.assistantMessage]);
            setAssistantDraft("");
            setUsage(chatEvent.usage);
          } else {
            setError(`${chatEvent.code}: ${chatEvent.message}`);
          }
        },
        controller.signal
      );
    } catch (caught) {
      if (!controller.signal.aborted) {
        setError(caught instanceof Error ? caught.message : "Chat failed.");
      }
    } finally {
      setIsStreaming(false);
      abortController.current = null;
    }
  };

  const startNewConversation = (): void => {
    abortController.current?.abort();
    setConversationId(undefined);
    setMessages([]);
    setAssistantDraft("");
    setUsage(undefined);
    setError("");
  };

  return (
    <section className="workspace chat-workspace" id="chat">
      <div className="workspace-heading">
        <div>
          <p className="section-kicker">Connectivity lab</p>
          <h1>Chat with Ollama</h1>
          <p>
            Exercise the complete browser, API, provider and realtime path from
            one diagnostic workspace.
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
            className={`connection-indicator ${realtimeStatus}`}
            aria-hidden="true"
          />
          <div>
            <strong>Socket.IO</strong>
            <span>
              {realtimeStatus}
              {latencyMs === undefined ? "" : ` · ${latencyMs} ms`}
            </span>
          </div>
          <button
            className="text-button"
            type="button"
            onClick={() => void testRealtime()}
          >
            Test
          </button>
        </article>
        <article className="connection-card">
          <span
            className={`connection-indicator ${isStreaming ? "connecting" : usage ? "connected" : "disconnected"}`}
            aria-hidden="true"
          />
          <div>
            <strong>Ollama stream</strong>
            <span>
              {isStreaming
                ? "receiving tokens"
                : usage
                  ? `${usage.model} · ${usage.durationMs} ms`
                  : "send a message to test"}
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
                startNewConversation();
              }}
              disabled={agents.isPending || isStreaming}
            >
              {agents.data?.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name} · {agent.model}
                </option>
              ))}
            </select>
          </label>
          {conversationId ? (
            <span className="conversation-id">
              Conversation {conversationId.slice(0, 8)}
            </span>
          ) : null}
        </div>

        <div className="message-list" aria-live="polite">
          {messages.length === 0 && !assistantDraft ? (
            <div className="chat-empty">
              <strong>Ready for a round trip.</strong>
              <span>
                Your first message creates a persisted conversation and streams
                the Ollama response back here.
              </span>
            </div>
          ) : null}
          {messages.map((message) => (
            <article
              className={`chat-message ${message.role.toLowerCase()}`}
              key={message.id}
            >
              <span>{message.role === "USER" ? "You" : "Assistant"}</span>
              <ChatMarkdown content={message.content} />
            </article>
          ))}
          {assistantDraft ? (
            <article className="chat-message assistant streaming">
              <span>Assistant · streaming</span>
              <ChatMarkdown content={assistantDraft} />
            </article>
          ) : null}
        </div>

        {error ? <p role="alert">{error}</p> : null}
        {usage ? (
          <p className="usage-line">
            {usage.provider}/{usage.model} · {usage.inputTokens} input ·{" "}
            {usage.outputTokens} output tokens · {usage.durationMs} ms
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
            placeholder="Ask the selected local agent something..."
            rows={3}
            disabled={!agentId || isStreaming}
          />
          <button
            className="primary-button"
            type="submit"
            disabled={!agentId || !draft.trim() || isStreaming}
          >
            {isStreaming ? "Streaming..." : "Send"}
          </button>
        </form>
      </div>
    </section>
  );
}
