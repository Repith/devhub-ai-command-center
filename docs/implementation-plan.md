# Implementation Plan

Each stage is a separate draft pull request. A stage begins only after its
dependency is merged.

## PR 1: Documentation and Agent Setup

- [x] Product, architecture, domain, API, realtime, RAG/MCP, security, and test
  documentation.
- [x] ADRs for major technology choices.
- [x] Agent roles, audited repository skills, contribution rules, and templates.
- [x] Owner review and merge.

Acceptance: an implementer can start PR 2 without making an architectural or
workflow decision.

## PR 2: Monorepo Foundation

- [x] Configure npm workspaces, Turborepo, strict TypeScript, ESLint, Prettier,
  and Husky.
- [x] Scaffold web, API, worker, contracts, domain, and config workspaces.
- [x] Add pinned PostgreSQL, Redis, and Qdrant Compose services.
- [x] Add CI for install, lint, typecheck, unit tests, and build.
- [x] Owner review and merge.

Acceptance: all empty applications build and checks pass locally and in CI.

## PR 3: Contracts, Domain, and Persistence

- [x] Add shared Zod contracts, error envelope, statuses, and event envelope.
- [x] Add tenant-aware repository ports and domain transition policies.
- [x] Add Prisma schema, initial migration, indexes, constraints, and seed.
- [x] Test migrations and cross-tenant repository behavior.
- [x] Owner review and merge.

Acceptance: the database can be recreated and seeded deterministically.

## PR 4: Authentication and Tenancy

- [x] Implement Argon2id registration and login.
- [x] Implement access JWTs and rotating hashed refresh sessions.
- [x] Add guards, role checks, logout, `/me`, and session reuse detection.
- [x] Add isolation and session integration tests.
- [x] Owner review and merge.

Acceptance: two seeded tenants cannot access each other's resources.

## PR 5: Dashboard and Agent Configuration

- [x] Build application shell, navigation, and TanStack Query client.
- [x] Implement tenant-scoped agent CRUD.
- [x] Add React Hook Form forms using shared Zod schemas.
- [x] Test validation, loading, empty, error, and authorization states.

Acceptance: a user can create and edit an agent definition from the UI.

## PR 6: Ollama Chat Foundation

- [x] Add `LlmProviderPort` and OpenAI-compatible Ollama adapter.
- [x] Add conversations, messages, streaming, timeouts, and fake provider.
- [x] Track preliminary token usage and duration.
- [x] Document required Ollama models and environment variables.

Acceptance: a persisted conversation streams a local-model response.

## PR 7: Document Upload and Ingestion

- [x] Add MD, TXT, and PDF upload validation and local volume storage.
- [x] Add idempotent `process-document` BullMQ job.
- [x] Parse, normalize, chunk, persist status, and surface failures.
- [x] Test retries, corrupt files, limits, and duplicate delivery.

Acceptance: supported files reach a deterministic chunked state.

## PR 8: Embeddings and Qdrant Retrieval

- [x] Add embedding and vector-store ports with Ollama and Qdrant adapters.
- [x] Upsert, search, reindex, and delete vectors idempotently.
- [x] Enforce tenant and active-document filters.
- [x] Return ranked sources and stable citations.

Acceptance: knowledge search returns only authorized chunks and citations.

## PR 9: MCP Integration

- [x] Add knowledge and RSS MCP servers with official TypeScript SDK.
- [x] Add MCP client, discovery, registry, validation, and allowlists.
- [x] Log calls and treat outputs as untrusted.
- [x] Test unauthorized calls, timeouts, and output limits.

Acceptance: diagnostic and agent calls can use only explicitly enabled tools.

## PR 10: Agent Runtime

- [x] Add `AgentRun`, steps, `run-agent` queue, and explicit runner loop.
- [x] Combine retrieval, model generation, and MCP tool calls.
- [x] Add cancellation, limits, timeout, retries, and correlation IDs.
- [x] Resume retries without duplicating completed effects.

Acceptance: one durable run can complete retrieval and one tool call.

## PR 11: Live Timeline

- [x] Add authenticated Socket.IO gateway and authorized run rooms.
- [x] Publish versioned run and step events via Redis Pub/Sub.
- [x] Add UI timeline, token streaming, reconnect, and REST recovery.
- [x] Test foreign subscriptions, gaps, duplicates, and reconnect.

Acceptance: the UI remains accurate after a connection interruption.

## PR 12: Usage and Budgets

- [x] Persist tokens, model, provider, latency, retries, and local zero cost.
- [x] Enforce run token, step, tool-call, and duration limits.
- [x] Add tenant, agent, and run usage views.
- [x] Test preflight and post-usage budget enforcement.

Acceptance: expensive or runaway runs terminate with an explainable state.

## PR 13: Golden Set Evaluation

- [x] Add golden case CRUD and `evaluate-golden-set` queue.
- [x] Add expected-fact, forbidden-claim, and expected-source evaluator.
- [x] Store reports with configuration versions and metrics.
- [x] Seed at least ten representative cases.

Acceptance: changes can be compared using repeatable evaluation reports.

## PR 14: Hardening and Portfolio Release

- [x] Add rate limits, upload hardening, structured logs, and audit views.
- [x] Complete E2E, accessibility, dependency, and security checks.
- [x] Add final diagrams, screenshots, demo script, and trade-off notes.
- [ ] Tag `v0.1.0` after owner review and merge.

Acceptance: the documented demo is repeatable from a clean checkout.

## PR 15: Knowledge RAG Diagnostics and Ingestion UX

- [x] Add consistent Redis connection parsing for API and worker BullMQ queues,
  including `REDIS_URL`, IPv4 localhost mapping, DB selection, credentials, and
  TLS preservation.
- [x] Improve document upload UX with an add-document modal, selected-file
  state, upload progress, queueing feedback, and polling while documents are
  `UPLOADED` or `PROCESSING`.
- [x] Add document deletion for owners/admins, including PostgreSQL chunk
  removal, Qdrant vector deletion by tenant/document, source-file cleanup, and
  audit logging.
- [x] Add manual retry/reindex so failed or stale documents can rerun parsing,
  chunking, embeddings, and vector replacement.
- [x] Surface typed queue/provider/vector errors with stable error codes and
  correlation IDs instead of generic 500 responses.
- [x] Make retrieval testing model-backed: retrieve authorized chunks, generate
  a cited answer with the configured Ollama chat model, and stream answer
  deltas to the UI.
- [x] Limit answer grounding to the top three retrieved chunks and show those
  sources as compact citation controls with hover/focus previews.
- [x] Paginate chunk inspection at five chunks per page so small chunk sizes do
  not overwhelm the UI.
- [x] Reduce default RAG chunking to 25 words with 5-word overlap for local
  experimentation and fine-grained CV/document retrieval.
- [x] Add OCR routing before indexing: direct text extraction for text-rich
  documents, OCR for images, and OCR fallback for text-poor scanned PDFs.
- [x] Support JPEG, PNG, and WebP uploads with file signature validation and
  route them through the OCR provider.
- [x] Document local OCR setup, default `qwen2.5vl:7b` model, routing
  thresholds, and troubleshooting guidance.
- [x] Extend focused API, worker, web, contracts, RAG, and MCP tests for the new
  search, retry, delete, OCR routing, and streaming behavior.

Acceptance: a user can upload text, PDF, scanned PDF, or image knowledge
sources; observe ingestion state; retry failed processing; delete sources
cleanly; inspect paginated chunks; and ask a Retrieval Test question that
streams a cited model answer grounded only in the top three authorized chunks.

## PR 16: LangChain and LangGraph Documentation

- [x] Add a LangChain/LangGraph guide that explains worker graph orchestration,
  default agents, Gmail review workflow, RSS news, usage analysis, and the
  dashboard home direction.
- [x] Add an ADR for using `@langchain/langgraph` Graph API in the worker while
  keeping PostgreSQL runs, BullMQ jobs, MCP allowlists, provider ports, budgets,
  and realtime contracts authoritative.
- [x] Update architecture, RAG/MCP, security, and testing docs so later code PRs
  have clear implementation boundaries.
- [ ] Owner review and merge.

Acceptance: an implementer can start PR 17 without deciding whether LangGraph
replaces persistence, authorization, MCP validation, or realtime delivery.

## PR 17: LangGraph Runtime Migration

- [x] Add a LangGraph `StateGraph` inside `apps/worker` with nodes for loading
  a run, tenant-filtered retrieval, optional RSS, LLM generation, completion,
  and terminal failure handling.
- [x] Preserve the existing `processAgentRun` public entrypoint, REST
  contracts, Socket.IO events, usage rows, step persistence, cancellation,
  timeouts, retry behavior, and tool allowlist enforcement.
- [x] Keep `LlmProviderPort` and `ToolRegistryPort` as the model and tool
  boundaries; do not introduce LangSmith, LangGraph Server, or checkpointer
  persistence in this stage.
- [x] Extend worker regression tests for graph routing and current runtime
  behavior.
- [ ] Owner review and merge.

Acceptance: one durable run still completes retrieval, optional RSS, and LLM
generation with the same tenant isolation and observable timeline as before.

## PR 18: Default Agent Templates

- [x] Add code-owned templates for Knowledge Researcher, Daily News Briefing,
  Gmail Triage, Gmail Reply Assistant, and Usage Analyst.
- [x] Install templates idempotently for new tenants and expose an owner/admin
  reset or install endpoint.
- [x] Store template metadata in shared contracts, including prompt, model,
  limits, enabled tools, and required connection state.
- [x] Show missing integration setup as explicit UI state instead of late
  runtime failure.
- [ ] Owner review and merge.

Acceptance: a new tenant starts with usable educational agent definitions and
can reinstall templates without overwriting unrelated custom agents.

## PR 19: Gmail MCP and Review Workflow

- [x] Add `apps/mcp-gmail` with Gmail tools for search/list threads, get
  thread, create draft, and update draft.
- [x] Add Gmail OAuth connection flow with encrypted refresh tokens, tenant/user
  ownership, audit logs, and no secret or mail-body leakage to prompts, logs,
  WebSocket payloads, or commits.
- [x] Add draft review records with `NEEDS_REVIEW`, `UPDATED`, `SENT`, and
  `REJECTED` states.
- [x] Add UI for reviewing, editing, sending, and rejecting proposed replies.
  Sending is an authenticated API action, not a model-callable MCP tool.
- [x] Document restricted Gmail scope implications and keep
  `AUTO_SEND_ALLOWED=false` by default.
- [ ] Owner review and merge.

Acceptance: an agent can prepare a Gmail draft, but a user must approve the
final recipients, subject, and body in the application before the API sends it.

## PR 20: RSS News Agent

- [x] Add tenant-owned RSS feed configuration with name, URL, topic, enabled
  flag, and last fetch metadata.
- [x] Extend the Daily News Briefing graph path to fetch selected feeds,
  summarize entries, include source links, and record usage.
- [x] Treat feed entries as untrusted content and keep external news API
  providers out of scope.
- [ ] Owner review and merge.

Acceptance: a tenant can configure RSS feeds and run a briefing agent that
summarizes only those feeds with links and token usage.

## PR 21: Usage and Token Summary

- [ ] Expand usage contracts and API responses with dashboard-ready totals by
  period, agent, run, provider, and model.
- [ ] Add an agent-friendly usage summary capability that reads persisted usage
  only and never estimates authoritative totals from prompt text.
- [ ] Surface budget warnings and recent expensive runs in API responses and UI.
- [ ] Owner review and merge.

Acceptance: users can inspect token spend and latency from persisted usage data
without relying on model-generated accounting.

## PR 22: Main Dashboard Home

- [ ] Make the first authenticated screen a command center with chat, selected
  agent, knowledge state, Gmail review queue, news briefing, token usage, and
  recent run timeline.
- [ ] Keep Agents, Knowledge, Runs, and Settings as secondary workspaces.
- [ ] Add accessible loading, empty, error, and unauthorized states for each
  dashboard widget.
- [ ] Verify the layout across desktop and mobile before merge.
- [ ] Owner review and merge.

Acceptance: after login, the user lands on a readable daily command center
instead of a configuration-first agent list.
