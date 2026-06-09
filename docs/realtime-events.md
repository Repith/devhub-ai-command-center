# Realtime Events

## Transport

The API exposes Socket.IO for authenticated run updates. The REST run snapshot
is authoritative; realtime events reduce latency but do not replace persisted
state.

## Connection and Subscription

The client sends an access token during the Socket.IO handshake. After
verification it may emit `subscribe_to_run` with a `runId`. The gateway loads
the run using authenticated tenant context before joining room `run:<runId>`.
Clients cannot choose a tenant room.

## Connectivity Probe

The `/realtime` namespace exposes an authenticated `realtime.probe` event for
the Chat connectivity workspace. It validates a versioned payload and returns
an acknowledgement with server timestamps. The acknowledgement deliberately
contains no tenant identifier or user data.

This probe verifies the browser-to-API WebSocket path. Chat model tokens remain
on the streamed HTTP endpoint until the live run timeline stage introduces
versioned Socket.IO run events.

## Event Envelope

```ts
type RealtimeEvent<TType extends string, TPayload> = {
  version: 1;
  type: TType;
  eventId: string;
  runId: string;
  sequence: number;
  timestamp: string;
  correlationId: string;
  payload: TPayload;
};
```

Events include `agent_run_started`, `agent_run_step_started`,
`agent_run_step_completed`, `llm_token`, `tool_call_completed`,
`agent_run_completed`, `agent_run_failed`, and `agent_run_cancelled`.

`llm_token` payloads are transient and may be omitted from persistence. Step and
terminal events always correspond to committed PostgreSQL state.

## Recovery

Clients reconnect with exponential backoff and fetch
`GET /api/v1/agent-runs/:runId` plus steps before resubscribing. Sequence gaps
trigger another snapshot. Duplicate events are ignored by `eventId` and
sequence. Unauthorized subscription attempts receive a generic error and are
audited without revealing whether a foreign run exists.
