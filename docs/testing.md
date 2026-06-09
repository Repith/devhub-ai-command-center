# Testing Strategy

## Test Layers

Unit tests cover framework-free logic: status transitions, chunking, budget
calculation, usage aggregation, DTO schemas, citation formatting, and rule-based
evaluation.

Integration tests use real disposable PostgreSQL, Redis, and Qdrant services for
repositories, migrations, BullMQ behavior, vector filtering, MCP discovery and
calls, and Socket.IO authorization. Ollama has contract tests plus a deterministic
fake for normal CI.

End-to-end tests exercise the browser-visible workflow from registration through
agent configuration, upload, indexing, cited answer, MCP call, timeline, usage,
and evaluation.

## Required Security Scenarios

- A user cannot read or mutate another tenant's agent, run, document, usage, or
  golden case.
- A socket cannot subscribe to a foreign run.
- A Qdrant query cannot return a foreign chunk.
- A queue payload cannot override persisted ownership.
- Refresh-token reuse revokes the affected session family.
- A model cannot call a tool absent from the agent allowlist.

## Failure Scenarios

Tests cover unavailable Ollama, embedding timeout, malformed PDF, retry after
worker failure, Qdrant outage, MCP timeout, duplicate job delivery, cancellation,
budget exhaustion, and WebSocket reconnect.

## Golden Set

At least ten seeded cases cover grounded architecture answers, required
citations, forbidden hallucinations, MCP selection, and tenant isolation.
Reports store configuration version, expected facts, forbidden claims, expected
sources, pass/fail details, latency, token usage, and retrieval hit.

## CI Gates

Once introduced, CI runs formatting checks, lint, typecheck, unit tests,
integration tests, migration validation, and build. E2E and live Ollama suites
may run in a separate workflow but must pass before a release tag.
