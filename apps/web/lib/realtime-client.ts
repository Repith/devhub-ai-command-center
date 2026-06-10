import { io, type Socket } from "socket.io-client";

import {
  realtimeProbeAckSchema,
  realtimeEventSchema,
  subscribeToRunAckSchema,
  type RealtimeEvent,
  type RealtimeProbeAck,
  type RealtimeProbeRequest,
  type SubscribeToRunAck
} from "@devhub/contracts";

export type RealtimeConnectionStatus =
  | "connecting"
  | "connected"
  | "disconnected"
  | "error";

export interface RealtimeClient {
  socket: Socket;
  probe(): Promise<{ ack: RealtimeProbeAck; latencyMs: number }>;
  subscribeToRun(runId: string): Promise<SubscribeToRunAck>;
  onRunEvent(handler: (event: RealtimeEvent) => void): () => void;
}

export function createRealtimeClient(accessToken: string): RealtimeClient {
  const origin = process.env.NEXT_PUBLIC_API_ORIGIN ?? "http://localhost:4000";
  const socket = io(`${origin}/realtime`, {
    auth: { token: accessToken },
    transports: ["websocket"],
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 500,
    timeout: 5_000
  });

  return {
    socket,
    onRunEvent: (handler) => {
      const listener = (value: unknown): void => {
        handler(realtimeEventSchema.parse(value));
      };
      socket.on("run.event", listener);
      return () => socket.off("run.event", listener);
    },
    subscribeToRun: (runId) =>
      new Promise((resolve, reject) => {
        socket
          .timeout(5_000)
          .emit(
            "subscribe_to_run",
            { version: 1, runId },
            (error: Error | null, response: unknown) => {
              if (error) {
                reject(error);
                return;
              }
              resolve(subscribeToRunAckSchema.parse(response));
            }
          );
      }),
    probe: () =>
      new Promise((resolve, reject) => {
        const input: RealtimeProbeRequest = {
          version: 1,
          requestId: crypto.randomUUID(),
          sentAt: new Date().toISOString()
        };
        const startedAt = performance.now();
        socket
          .timeout(5_000)
          .emit(
            "realtime.probe",
            input,
            (error: Error | null, response: unknown) => {
              if (error) {
                reject(error);
                return;
              }
              resolve({
                ack: realtimeProbeAckSchema.parse(response),
                latencyMs: Math.round(performance.now() - startedAt)
              });
            }
          );
      })
  };
}
