# ADR 0005: Socket.IO for Live Run Events

Status: Accepted

Use NestJS Socket.IO for bidirectional authenticated subscriptions and future
cancellation interactions. REST snapshots remain authoritative. Redis Pub/Sub
bridges workers to the gateway and supports multiple API instances.
