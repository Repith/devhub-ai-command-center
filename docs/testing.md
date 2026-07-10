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

End-to-end tests exercise the release command-center path from registration
through template-backed agents, upload, indexing, cited answers, MCP calls,
Gmail draft review, GitHub repository reads, reviewed GitHub write drafts, RSS
news, timeline, usage, saved workflows, and full-runtime evaluation.

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
- A GitHub issue or pull request write can be submitted only through the
  authenticated action-review API, never as a model-callable MCP tool.

## Failure Scenarios

Tests cover unavailable Ollama, embedding timeout, malformed PDF, retry after
worker failure, Qdrant outage, MCP timeout, duplicate job delivery,
cancellation, budget exhaustion, LangGraph node failure, Gmail OAuth failure,
GitHub OAuth failure, draft rejection, reviewed-write rejection, RSS fetch
failure, and WebSocket reconnect.

## Golden Set

At least ten seeded cases cover grounded architecture answers, required
citations, forbidden hallucinations, MCP selection, and tenant isolation.
Reports store configuration version, expected facts, forbidden claims, expected
sources, pass/fail details, latency, token usage, and retrieval hit.

## CI Gates

Once introduced, CI runs formatting checks, lint, typecheck, unit tests,
integration tests, migration validation, and build. E2E and live Ollama suites
may run in a separate workflow but must pass before a release tag.

## End-To-End Release Coverage

`npm run test:e2e` executes the release command-center flow in `apps/e2e`.
This suite is deterministic and validates the shared contracts used by the
documented demo path: registration, template-backed durable runs, indexed
knowledge, RSS briefing inputs, Gmail mock or OAuth status, GitHub App
installation metadata, read-only GitHub tools, reviewed write records, usage
observability, run timeline snapshots, and full-runtime golden evaluation. It
complements the database-backed integration suites; it does not replace a
manual clean-checkout demo with PostgreSQL, Redis, Qdrant, Ollama, and optional
Gmail/GitHub OAuth running.

Database-backed integration tests are skipped when `DATABASE_URL` is missing.
Treat a skipped integration run as incomplete release evidence, not as proof
that persistence, queues, or tenant isolation were exercised.

`npm run eval:golden` is the release wrapper for the seeded full-runtime golden
set. It requires `DEVHUB_ACCESS_TOKEN` and a running local API/worker stack,
then posts `FULL_AGENT_RUNTIME` to the evaluation API and polls until the report
reaches a terminal state.
