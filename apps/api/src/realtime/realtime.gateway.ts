import { Inject } from "@nestjs/common";
import {
  Ack,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  type OnGatewayInit
} from "@nestjs/websockets";
import type { Namespace, Socket } from "socket.io";

import {
  realtimeProbeRequestSchema,
  type RealtimeProbeAck
} from "@devhub/contracts";

import { AuthPrincipalService } from "../auth/auth-principal.service";
import type { RequestPrincipal } from "../auth/auth.types";

interface AuthenticatedSocketData {
  principal: RequestPrincipal;
}

type AuthenticatedSocket = Socket<
  Record<string, never>,
  Record<string, never>,
  Record<string, never>,
  AuthenticatedSocketData
>;

@WebSocketGateway({
  namespace: "/realtime",
  cors: {
    origin: process.env.WEB_ORIGIN ?? "http://localhost:3000",
    credentials: true
  }
})
export class RealtimeGateway implements OnGatewayInit {
  public constructor(
    @Inject(AuthPrincipalService)
    private readonly principals: AuthPrincipalService
  ) {}

  public afterInit(server: Namespace): void {
    server.use(async (socket: AuthenticatedSocket, next) => {
      try {
        const token = socket.handshake.auth.token;
        if (typeof token !== "string" || token.length === 0) {
          next(new Error("Authentication required."));
          return;
        }
        socket.data.principal = await this.principals.resolveAccessToken(token);
        next();
      } catch {
        next(new Error("Authentication failed."));
      }
    });
  }

  @SubscribeMessage("realtime.probe")
  public probe(
    @MessageBody() input: unknown,
    @Ack() ack: (response: RealtimeProbeAck) => void
  ): void {
    const receivedAt = new Date().toISOString();
    const parsed = realtimeProbeRequestSchema.safeParse(input);
    if (!parsed.success) {
      ack({
        ok: false,
        error: {
          code: "INVALID_REALTIME_PROBE",
          message: "The realtime probe payload is invalid."
        }
      });
      return;
    }

    ack({
      ok: true,
      event: {
        version: 1,
        type: "realtime.probe_ack",
        requestId: parsed.data.requestId,
        receivedAt,
        respondedAt: new Date().toISOString()
      }
    });
  }
}
