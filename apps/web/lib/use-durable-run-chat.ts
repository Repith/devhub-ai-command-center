"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import type {
  AgentRun,
  ChatUsage,
  ConversationMessage,
  CreateAgentRun,
  RealtimeEvent
} from "@devhub/contracts";

import { listConversationMessages } from "./conversations-api";
import {
  appendTokenDelta,
  isTerminalRunStatus,
  usageFromMessages
} from "./durable-chat-state";
import {
  createRealtimeClient,
  type RealtimeClient,
  type RealtimeConnectionStatus
} from "./realtime-client";
import { cancelRun, getRunSnapshot, startRun } from "./runs-api";

export interface DurableRunChatState {
  assistantDraft: string;
  conversationId: string | undefined;
  currentRunId: string | null;
  error: string;
  isRunning: boolean;
  messages: readonly ConversationMessage[];
  realtimeStatus: RealtimeConnectionStatus;
  terminalStatus: AgentRun["status"] | null;
  usage: ChatUsage | undefined;
}

export interface DurableRunChatController extends DurableRunChatState {
  cancel(): Promise<void>;
  reset(): void;
  send(message: string, options?: DurableRunChatSendOptions): Promise<void>;
}

export interface DurableRunChatSendOptions {
  agentId?: string;
  input?: Partial<Omit<CreateAgentRun, "message" | "conversationId">>;
}

export function useDurableRunChat(input: {
  accessToken: string;
  agentId: string;
}): DurableRunChatController {
  const { accessToken, agentId } = input;
  const queryClient = useQueryClient();
  const clientRef = useRef<RealtimeClient | null>(null);
  const runIdRef = useRef<string | null>(null);
  const recoveringRef = useRef<Set<string>>(new Set());
  const [assistantDraft, setAssistantDraft] = useState("");
  const [conversationId, setConversationId] = useState<string>();
  const [currentRunId, setCurrentRunId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [realtimeStatus, setRealtimeStatus] =
    useState<RealtimeConnectionStatus>("connecting");
  const [runStatus, setRunStatus] = useState<AgentRun["status"] | null>(null);
  const [terminalStatus, setTerminalStatus] = useState<
    AgentRun["status"] | null
  >(null);
  const [usage, setUsage] = useState<ChatUsage>();

  const recoverRun = useCallback(
    async (runId: string): Promise<void> => {
      if (recoveringRef.current.has(runId)) {
        return;
      }
      recoveringRef.current.add(runId);
      try {
        const snapshot = await getRunSnapshot(accessToken, runId);
        await queryClient.setQueryData(["run-snapshot", runId], snapshot);
        setRunStatus(snapshot.run.status);
        setTerminalStatus(
          isTerminalRunStatus(snapshot.run.status) ? snapshot.run.status : null
        );
        setError(snapshot.run.errorMessage ?? "");
        if (snapshot.run.conversationId) {
          setConversationId(snapshot.run.conversationId);
          const persistedMessages = await listConversationMessages(
            accessToken,
            snapshot.run.conversationId
          );
          setMessages(persistedMessages);
          setUsage(usageFromMessages(persistedMessages));
          if (isTerminalRunStatus(snapshot.run.status)) {
            setAssistantDraft("");
          }
        }
        await queryClient.invalidateQueries({ queryKey: ["runs"] });
        if (isTerminalRunStatus(snapshot.run.status)) {
          await queryClient.invalidateQueries({ queryKey: ["usage"] });
        }
      } finally {
        recoveringRef.current.delete(runId);
      }
    },
    [accessToken, queryClient]
  );

  const subscribeToRun = useCallback(
    async (runId: string): Promise<void> => {
      const client = clientRef.current;
      if (!client) {
        return;
      }
      const ack = await client.subscribeToRun(runId);
      if (ack.ok) {
        await queryClient.setQueryData(["run-snapshot", runId], ack.snapshot);
        setRunStatus(ack.snapshot.run.status);
        if (isTerminalRunStatus(ack.snapshot.run.status)) {
          await recoverRun(runId);
        }
      }
    },
    [queryClient, recoverRun]
  );

  useEffect(() => {
    const client = createRealtimeClient(accessToken);
    clientRef.current = client;

    const onRunEvent = (event: RealtimeEvent): void => {
      if (event.payload.runId !== runIdRef.current) {
        return;
      }
      if (event.type === "agent_run.token_delta") {
        setAssistantDraft((current) =>
          appendTokenDelta(current, runIdRef.current, event)
        );
        return;
      }
      if (event.type === "agent_run.started") {
        setRunStatus(event.payload.status);
        return;
      }
      if (event.type === "agent_run.status_changed") {
        setRunStatus(event.payload.status);
        setError(event.payload.errorMessage ?? "");
        if (isTerminalRunStatus(event.payload.status)) {
          setTerminalStatus(event.payload.status);
          void recoverRun(event.payload.runId);
        }
      }
    };
    const unsubscribe = client.onRunEvent(onRunEvent);
    const resubscribe = (): void => {
      setRealtimeStatus("connected");
      const runId = runIdRef.current;
      if (runId) {
        void subscribeToRun(runId);
        void recoverRun(runId);
      }
    };

    client.socket.on("connect", resubscribe);
    client.socket.on("disconnect", () => setRealtimeStatus("disconnected"));
    client.socket.on("connect_error", () => setRealtimeStatus("error"));
    if (client.socket.connected) {
      resubscribe();
    }

    return () => {
      unsubscribe();
      client.socket.off("connect", resubscribe);
      client.socket.disconnect();
      clientRef.current = null;
    };
  }, [accessToken, recoverRun, subscribeToRun]);

  const send = useCallback(
    async (
      message: string,
      options: DurableRunChatSendOptions = {}
    ): Promise<void> => {
      const trimmed = message.trim();
      const runAgentId = options.agentId ?? agentId;
      if (!runAgentId || !trimmed || isActiveRunStatus(runStatus)) {
        return;
      }
      try {
        setAssistantDraft("");
        setError("");
        setTerminalStatus(null);
        setUsage(undefined);
        const run = await startRun(accessToken, runAgentId, {
          message: trimmed,
          ...(conversationId ? { conversationId } : {}),
          retrievalLimit: 5,
          ...options.input
        });
        runIdRef.current = run.id;
        setCurrentRunId(run.id);
        setConversationId(run.conversationId ?? conversationId);
        setRunStatus(run.status);
        setMessages((current) => [
          ...current,
          optimisticUserMessage(run.conversationId, trimmed)
        ]);
        await queryClient.setQueryData(["run-snapshot", run.id], {
          run,
          steps: []
        });
        await queryClient.invalidateQueries({ queryKey: ["runs"] });
        void subscribeToRun(run.id).catch(() => setRealtimeStatus("error"));
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Run failed.");
      }
    },
    [
      accessToken,
      conversationId,
      agentId,
      queryClient,
      runStatus,
      subscribeToRun
    ]
  );

  const cancel = useCallback(async (): Promise<void> => {
    const runId = runIdRef.current;
    if (!runId || !isActiveRunStatus(runStatus)) {
      return;
    }
    try {
      const run = await cancelRun(accessToken, runId);
      setRunStatus(run.status);
      await queryClient.invalidateQueries({ queryKey: ["runs"] });
      await queryClient.setQueryData(["run-snapshot", run.id], (current) =>
        current && typeof current === "object" ? { ...current, run } : current
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Cancel failed.");
    }
  }, [accessToken, queryClient, runStatus]);

  const reset = useCallback((): void => {
    runIdRef.current = null;
    setAssistantDraft("");
    setConversationId(undefined);
    setCurrentRunId(null);
    setError("");
    setMessages([]);
    setRunStatus(null);
    setTerminalStatus(null);
    setUsage(undefined);
  }, []);

  return {
    assistantDraft,
    cancel,
    conversationId,
    currentRunId,
    error,
    isRunning: isActiveRunStatus(runStatus),
    messages,
    realtimeStatus,
    reset,
    send,
    terminalStatus,
    usage
  };
}

function isActiveRunStatus(status: AgentRun["status"] | null): boolean {
  return (
    status === "QUEUED" || status === "RUNNING" || status === "CANCEL_REQUESTED"
  );
}

function optimisticUserMessage(
  conversationId: string | null,
  content: string
): ConversationMessage {
  return {
    id: `optimistic-${crypto.randomUUID()}`,
    conversationId: conversationId ?? "pending",
    role: "USER",
    content,
    sequence: Number.MAX_SAFE_INTEGER,
    provider: null,
    model: null,
    inputTokens: null,
    outputTokens: null,
    durationMs: null,
    createdAt: new Date().toISOString()
  };
}
