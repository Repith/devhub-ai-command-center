import { io, type Socket } from "socket.io-client";

import {
  realtimeProbeAckSchema,
  type RealtimeProbeAck,
  type RealtimeProbeRequest
} from "@devhub/contracts";

export type RealtimeConnectionStatus =
  | "connecting"
  | "connected"
  | "disconnected"
  | "error";

export interface RealtimeClient {
  socket: Socket;
  probe(): Promise<{ ack: RealtimeProbeAck; latencyMs: number }>;
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
