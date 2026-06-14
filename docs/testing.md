# Testing Strategy

## Test Layers

Unit tests cover framework-free logic: status transitions, chunking, budget
calculation, usage aggregation, DTO schemas, citation formatting, graph routing,
prompt/context construction, and rule-based evaluation.

Integration tests use real disposable PostgreSQL, Redis, and Qdrant services for
repositories, migrations, BullMQ behavior, vector filtering, MCP discovery and
calls, worker LangGraph execution, and Socket.IO authorization. Ollama has
contract tests plus a deterministic fake for normal CI.

Durable chat regression tests cover new conversation run creation, existing
conversation continuation, assistant message persistence after successful
worker completion, no assistant message on failure or cancellation, and usage
summaries derived from `TokenUsage` rows created by chat-triggered runs.

End-to-end tests exercise the browser-visible workflow from registration through
agent configuration, upload, indexing, cited answer, MCP call, timeline, usage,
and evaluation.

## Required Security Scenarios

- A user cannot read or mutate another tenant's agent, run, document, usage, or
  golden case.
- A socket cannot subscribe to a foreign run.
- A Qdrant query cannot return a foreign chunk.
- A queue payload cannot override persisted ownership.
- A browser-provided conversation identifier cannot attach a run to another
  tenant or agent.
- Refresh-token reuse revokes the affected session family.
- A model cannot call a tool absent from the agent allowlist.
- A graph node cannot bypass tool allowlists, tenant checks, or budget
  enforcement.
- A Gmail draft can be sent only through the authenticated review API, never as
  a model-callable tool.

## Failure Scenarios

Tests cover unavailable Ollama, embedding timeout, malformed PDF, retry after
worker failure, Qdrant outage, MCP timeout, duplicate job delivery,
cancellation, budget exhaustion, LangGraph node failure, Gmail OAuth failure,
draft rejection, RSS fetch failure, and WebSocket reconnect.

## Golden Set

At least ten seeded cases cover grounded architecture answers, required
citations, forbidden hallucinations, MCP selection, and tenant isolation.
Reports store configuration version, expected facts, forbidden claims, expected
sources, pass/fail details, latency, token usage, and retrieval hit.

## CI Gates

Once introduced, CI runs formatting checks, lint, typecheck, unit tests,
integration tests, migration validation, and build. E2E and live Ollama suites
may run in a separate workflow but must pass before a release tag.
