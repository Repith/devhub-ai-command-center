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
