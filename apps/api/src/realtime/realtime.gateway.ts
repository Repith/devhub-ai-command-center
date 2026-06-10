import { Inject } from "@nestjs/common";
import {
  Ack,
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  type OnGatewayInit
} from "@nestjs/websockets";
import type { Namespace, Socket } from "socket.io";

import {
  realtimeProbeRequestSchema,
  subscribeToRunRequestSchema,
  type RealtimeEvent,
  type RealtimeProbeAck,
  type SubscribeToRunAck
} from "@devhub/contracts";

import { AuthPrincipalService } from "../auth/auth-principal.service";
import type { RequestPrincipal } from "../auth/auth.types";
import { RunsService } from "../runs/runs.service";
import { RealtimeRedisSubscriber } from "./realtime-pubsub.service";

interface AuthenticatedSocketData {
  principal: RequestPrincipal;
}

type AuthenticatedSocket = Socket<
  {
    "run.event": (event: RealtimeEvent) => void;
  },
  {
    "realtime.probe": (
      input: unknown,
      ack: (response: RealtimeProbeAck) => void
    ) => void;
    subscribe_to_run: (
      input: unknown,
      ack: (response: SubscribeToRunAck) => void
    ) => void;
  },
  {
    "run.event": (event: RealtimeEvent) => void;
  },
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
  @WebSocketServer()
  private server!: Namespace;

  public constructor(
    @Inject(AuthPrincipalService)
    private readonly principals: AuthPrincipalService,
    @Inject(RunsService) private readonly runs: RunsService,
    @Inject(RealtimeRedisSubscriber)
    private readonly subscriber: RealtimeRedisSubscriber
  ) {}

  public afterInit(server: Namespace): void {
    this.server = server;
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
    void this.subscriber.start((event) => this.publish(event));
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

  @SubscribeMessage("subscribe_to_run")
  public async subscribeToRun(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() input: unknown,
    @Ack() ack: (response: SubscribeToRunAck) => void
  ): Promise<void> {
    const parsed = subscribeToRunRequestSchema.safeParse(input);
    if (!parsed.success) {
      ack({
        ok: false,
        error: {
          code: "INVALID_SUBSCRIPTION",
          message: "The run subscription payload is invalid."
        }
      });
      return;
    }

    try {
      const snapshot = await this.runs.get(
        socket.data.principal,
        parsed.data.runId
      );
      await socket.join(
        roomName(socket.data.principal.tenantId, parsed.data.runId)
      );
      ack({ ok: true, snapshot });
    } catch {
      ack({
        ok: false,
        error: {
          code: "RUN_NOT_FOUND",
          message: "The agent run was not found for this tenant."
        }
      });
    }
  }

  private publish(event: RealtimeEvent): void {
    this.server
      .to(roomName(event.tenantId, event.payload.runId))
      .emit("run.event", event);
  }
}

function roomName(tenantId: string, runId: string): string {
  return `tenant:${tenantId}:run:${runId}`;
}
