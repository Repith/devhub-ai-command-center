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

- [x] Expand usage contracts and API responses with dashboard-ready totals by
  period, agent, run, provider, and model.
- [x] Add an agent-friendly usage summary capability that reads persisted usage
  only and never estimates authoritative totals from prompt text.
- [x] Surface budget warnings and recent expensive runs in API responses and UI.
- [ ] Owner review and merge.

Acceptance: users can inspect token spend and latency from persisted usage data
without relying on model-generated accounting.

## PR 22: Main Dashboard Home

- [x] Make the first authenticated screen a command center with chat, selected
  agent, knowledge state, Gmail review queue, news briefing, token usage, and
  recent run timeline.
- [x] Keep Agents, Knowledge, Runs, and Settings as secondary workspaces.
- [x] Add accessible loading, empty, error, and unauthorized states for each
  dashboard widget.
- [ ] Verify the layout across desktop and mobile before merge.
- [ ] Owner review and merge.

Acceptance: after login, the user lands on a readable daily command center
instead of a configuration-first agent list.

## PR 23: Runtime Path Audit and AgentRun Conversation Bridge

- [x] Make the durable `AgentRun` path the authoritative execution path for agent-backed user interactions.
- [x] Preserve the existing `/agents/:agentId/chat` endpoint temporarily, but mark it as a compatibility path or adapt it internally to create an `AgentRun`.
- [x] Add conversation persistence to worker-backed runs:
  - create or reuse a tenant-scoped conversation when `conversationId` is provided,
  - persist the user message before enqueueing or as part of run creation,
  - persist the full assistant message after `llm.generate` completes,
  - keep `AgentRunStep.outputPreview` as a bounded preview, not the only copy of the answer.
- [x] Ensure model usage from worker-backed conversations is recorded in `TokenUsage`, so `/usage` includes the main chat experience.
- [x] Ensure direct `Message` token fields and `TokenUsage` cannot diverge silently:
  - either derive message usage from `TokenUsage`,
  - or write both in one transaction when the assistant message is persisted.
- [x] Add regression tests for:
  - new conversation + run creation,
  - existing conversation + run continuation,
  - assistant message persistence after run completion,
  - failure without assistant message creation,
  - cancellation without assistant message creation,
  - usage summary including chat-triggered runs.
- [x] Update `docs/architecture.md`, `docs/api-contracts.md`, and `docs/testing.md` to state that durable runs are the primary agent execution path.

Acceptance: asking an agent through the application creates an `AgentRun`, produces `AgentRunStep` rows, streams progress through the existing realtime/run contracts, persists the final assistant message, and records usage in `TokenUsage`.

## PR 24: Dashboard Chat over Durable Runs

- [x] Replace the home dashboard `streamChat()` path with a durable run-based chat flow.
- [x] Update `DashboardHome` and `ChatWorkspace` to use:
  - `POST /api/v1/agents/:agentId/runs`,
  - Socket.IO run events for token deltas and step changes,
  - REST run snapshots for reconnect/recovery.
- [x] Keep the UI behavior equivalent for users:
  - selected agent,
  - message composer,
  - streaming assistant response,
  - cancellation,
  - visible usage summary.
- [x] Add a lightweight client-side run session state:
  - current run ID,
  - conversation ID,
  - streamed assistant draft,
  - terminal run status,
  - error message.
- [x] Remove duplicate client logic between command center chat and full chat workspace where practical.
- [x] Keep `/agents/:agentId/chat` only as a legacy/simple-model endpoint until all UI consumers are migrated.
- [x] Add tests for:
  - home chat starts an `AgentRun`,
  - token deltas render in order,
  - reconnect recovers run snapshot,
  - cancellation calls `/runs/:runId/cancel`,
  - errors render from terminal run state,
  - usage widgets refresh after completion.

Acceptance: the default dashboard chat exercises the same LangGraph worker runtime as Runs, including RAG, MCP tools, budgets, timeline, usage tracking, and tenant isolation.

## PR 25: Gmail Runtime Integration

- [x] Decide the Gmail tool boundary:
  - either register Gmail tools directly in the worker with a safe token access provider,
  - or route Gmail tool execution through an API-owned service boundary.
- [x] Register `gmail.search_threads`, `gmail.get_thread`, `gmail.create_draft`, and `gmail.update_draft` in the worker `ToolRegistryPort` only when Gmail is configured.
- [x] Add a tenant/user-scoped Gmail access token provider for worker-side tool execution:
  - decrypt refresh/access tokens only server-side,
  - refresh access tokens when needed,
  - never expose tokens in prompts, logs, WebSocket events, step previews, or tool previews.
- [x] Extend `CreateAgentRun` or add a narrow Gmail run input contract for:
  - Gmail thread search query,
  - explicit thread ID for reply drafting,
  - optional draft review target.
- [x] Add LangGraph routing for Gmail templates:
  - `gmail-triage`: search threads -> get bounded thread summaries -> generate priority summary.
  - `gmail-reply-assistant`: get explicit thread -> generate draft content -> create/update Gmail draft -> create local draft review record.
- [x] Sending must remain an authenticated API action from the review UI, never a model-callable tool.
- [x] Validate and bound Gmail message bodies before prompt use.
- [x] Add tests for:
  - missing Gmail connection,
  - expired Gmail token refresh,
  - Gmail tool allowlist denial,
  - Gmail triage summary without mutation,
  - Gmail reply draft creation,
  - local draft review creation linked to the current tenant/user/run,
  - no send action from worker/tool registry,
  - no token/mail-body leakage in logs, events, step previews, or audit metadata.

Acceptance: Gmail Triage and Gmail Reply Assistant templates produce useful durable runs through LangGraph, create reviewable drafts when appropriate, and cannot send email without explicit authenticated user approval.

## PR 26: Gmail Draft Review Integrity and Security Hardening

- [x] Remove or restrict public client control over `agentRunId` in `createGmailDraftReviewSchema`.
- [x] When a draft review is linked to an `AgentRun`, verify the run belongs to the current tenant and intended user context before persisting the link.
- [x] Update `PrismaGmailDraftReviewRepository.create` or the service layer to enforce tenant-scoped `agentRunId` validation.
- [x] Ensure `GmailDraftReview.agentRunId` cannot reference a run from another tenant.
- [x] Consider changing the Prisma relation to a tenant-aware composite relation where practical.
- [x] Add tests for:
  - foreign tenant `agentRunId` rejection,
  - foreign user review access rejection,
  - update/reject/send only for current tenant/user,
  - SENT/REJECTED reviews cannot be modified,
  - send action requires a connected Gmail account,
  - send action audits only metadata, not message body.

Acceptance: Gmail draft reviews cannot be linked to or mutated through cross-tenant or cross-user identifiers, and review/send operations remain server-authoritative.

## PR 27: Dynamic Template Setup State

- [ ] Replace static `templateSetup` responses with dynamic setup state derived from current tenant resources.
- [ ] Compute template readiness from:
  - Gmail connection status,
  - enabled tenant news feeds,
  - indexed knowledge documents,
  - availability of `usage.summary`,
  - available MCP tools in the server registry.
- [ ] Keep `DEFAULT_AGENT_TEMPLATES` as code-owned template definitions, but make `requiredSetup.status` response-time data.
- [ ] Add setup summaries to agent responses:
  - `READY`,
  - `NEEDS_SETUP`,
  - `PLANNED`,
  - optionally `MISCONFIGURED` if an integration exists but server env is incomplete.
- [ ] Update the dashboard and agent workspace to show actionable setup states:
  - connect Gmail,
  - add RSS feed,
  - upload/index knowledge,
  - install/reset templates.
- [ ] Add tests for:
  - Gmail disconnected -> Gmail templates need setup,
  - Gmail connected -> Gmail templates ready except explicit planned review features,
  - no news feeds -> Daily News Briefing needs setup,
  - enabled news feeds -> Daily News Briefing ready,
  - no indexed documents -> Knowledge Researcher shows missing knowledge,
  - member cannot reset templates.

Acceptance: template cards and selected agents show real integration readiness instead of static setup hints.

## PR 28: LangGraph Runtime Modularization

- [ ] Split the oversized `apps/worker/src/agent-run-processor.ts` into explicit runtime modules:
  - `agent-graph/agent-run-graph.ts`,
  - `agent-graph/agent-graph-state.ts`,
  - `agent-graph/agent-step-runner.ts`,
  - `agent-graph/nodes/load-run.node.ts`,
  - `agent-graph/nodes/retrieve-knowledge.node.ts`,
  - `agent-graph/nodes/fetch-news.node.ts`,
  - `agent-graph/nodes/summarize-usage.node.ts`,
  - `agent-graph/nodes/generate-answer.node.ts`,
  - `agent-graph/nodes/complete-run.node.ts`.
- [ ] Preserve `processAgentRun(options)` as the public worker entrypoint.
- [ ] Preserve existing step kinds:
  - `rag.retrieve`,
  - `mcp.news`,
  - `usage.summary`,
  - `llm.generate`.
- [ ] Keep all persistence, cancellation, budget, retry, usage, and realtime behavior behind reusable helpers.
- [ ] Consider compiling the default graph once per processor instance instead of rebuilding the graph for every run, as long as run-specific state remains passed through invocation.
- [ ] Treat runtime-only values such as `AbortSignal`, service dependencies, and transient caches as non-persisted graph state. LangGraph supports untracked values for state that should exist during execution but not be checkpointed; use that pattern if checkpointers are introduced later.
- [ ] Add focused unit tests for each node and router:
  - load run success / missing run,
  - retrieval enabled / disabled,
  - news URL / configured feeds / no feeds,
  - usage summary enabled / disabled,
  - LLM token stream,
  - completion,
  - cancellation,
  - timeout,
  - tool registry error,
  - token budget exceeded,
  - max tool calls exceeded.

Acceptance: the LangGraph runtime is small, testable, and ready for future workflow compilation without changing external API, queue, persistence, or realtime contracts.

## PR 29: Safe Workflow Definition Contracts

- [ ] Add `packages/contracts/src/agent-workflows.ts`.
- [ ] Define Zod schemas for a future visual workflow graph:
  - `AgentWorkflowDefinition`,
  - `AgentWorkflowNode`,
  - `AgentWorkflowEdge`,
  - `AgentWorkflowNodeType`,
  - `AgentWorkflowCondition`,
  - node config schemas.
- [ ] Supported MVP node types:
  - `start`,
  - `knowledge.search`,
  - `news.fetch_rss`,
  - `usage.summary`,
  - `gmail.search_threads`,
  - `gmail.get_thread`,
  - `gmail.create_draft`,
  - `gmail.update_draft`,
  - `llm.generate`,
  - `condition`,
  - `human.review`,
  - `complete`,
  - `fail`.
- [ ] Supported safe condition types:
  - `always`,
  - `field.exists`,
  - `field.equals`,
  - `tool.enabled`,
  - `connection.exists`,
  - `previousStep.succeeded`,
  - `previousStep.failed`.
- [ ] Explicitly reject:
  - arbitrary JavaScript,
  - string expressions that require `eval`,
  - user-defined code,
  - arbitrary HTTP calls,
  - arbitrary shell commands,
  - arbitrary MCP tool IDs outside `mcpToolIdSchema`.
- [ ] Add validation helpers for:
  - exactly one start node,
  - at least one terminal node,
  - no dangling edges,
  - no orphaned required nodes,
  - unique node IDs,
  - unique edge IDs,
  - valid node config,
  - valid safe conditions,
  - no unsupported cycles in MVP.
- [ ] Add contract tests for valid and invalid workflow definitions.

Acceptance: the repository has a safe, serializable workflow DSL that can be rendered visually later but cannot execute arbitrary code.

## PR 30: Read-only Workflow Visualizer

- [ ] Add `@xyflow/react` to `apps/web`.
- [ ] Import React Flow CSS in the global stylesheet, not inside arbitrary components.
- [ ] Add a read-only `AgentWorkflowPreview` component.
- [ ] Render static graphs for current template/runtime paths:
  - Knowledge Researcher,
  - Daily News Briefing,
  - Usage Analyst,
  - Gmail Triage,
  - Gmail Reply Assistant.
- [ ] Show conditional edge labels:
  - `if tool enabled`,
  - `if rssUrl exists`,
  - `if enabled feeds exist`,
  - `if Gmail connected`,
  - `on failure`.
- [ ] Add this preview to the Agent detail or Runs workspace.
- [ ] Keep it read-only in this PR.
- [ ] Add tests for:
  - expected nodes render,
  - expected edge labels render,
  - missing workflow falls back to template graph,
  - loading/error/empty states.

Acceptance: users can see how an agent is expected to execute as a block graph, without changing runtime behavior yet.

## PR 31: Workflow Compiler Foundation

- [ ] Add a server-side workflow compiler in `apps/worker/src/agent-graph/workflow-compiler.ts`.
- [ ] Compile validated `AgentWorkflowDefinition` into a LangGraph `StateGraph`.
- [ ] Use a fixed server-side node handler registry:
  - no arbitrary user code,
  - no eval,
  - no arbitrary tool execution.
- [ ] Keep calls behind existing boundaries:
  - `ToolRegistryPort`,
  - `LlmProviderPort`,
  - tenant-scoped repositories,
  - `AgentStepRunner`,
  - budget/cancellation checks.
- [ ] Do not enable user-edited workflows in production runtime yet.
- [ ] Add tests for:
  - simple knowledge workflow compilation,
  - conditional RSS workflow compilation,
  - usage summary workflow compilation,
  - unknown node rejection,
  - unknown condition rejection,
  - dangling edge rejection,
  - missing terminal rejection,
  - unsupported cycle rejection,
  - disabled tool cannot be called.

Acceptance: workflow definitions can be validated and compiled safely in tests, but default runtime remains code-owned until the editor and persistence are ready.

## PR 32: Editable Workflow Persistence and Visual Editor

- [ ] Add optional workflow definition persistence to `AgentDefinition`, using a JSON column plus a workflow version field.
- [ ] Add API endpoints:
  - `GET /api/v1/agents/:agentId/workflow`,
  - `PUT /api/v1/agents/:agentId/workflow`,
  - `POST /api/v1/agents/:agentId/workflow/validate`.
- [ ] Enforce owner/admin role checks and tenant ownership.
- [ ] Build an MVP React Flow editor:
  - node palette,
  - draggable nodes,
  - connectable edges,
  - edge condition editor,
  - selected node config panel,
  - validation panel,
  - save/reset actions.
- [ ] Start node must exist and not be deletable.
- [ ] Complete/fail terminal path must be required.
- [ ] Save must be disabled until server validation passes.
- [ ] Store only safe workflow JSON, not executable code.
- [ ] Add tests for:
  - owner/admin can save valid workflow,
  - member cannot save workflow,
  - invalid workflow rejected server-side,
  - unknown node type rejected,
  - forbidden condition rejected,
  - cross-tenant save rejected,
  - editor can add/connect/configure nodes,
  - reset to template graph.

Acceptance: owners/admins can visually configure an agent workflow using safe block definitions, and the server remains authoritative for validation.

## PR 33: Runtime Execution from Saved Workflows

- [ ] If an agent has a saved workflow definition, validate and compile it at run start.
- [ ] If no saved workflow exists, use the code-owned default graph.
- [ ] Keep the existing default template behavior stable.
- [ ] Preserve all runtime boundaries:
  - PostgreSQL is source of truth,
  - BullMQ is the durable job boundary,
  - `AgentRunStep` records every operation,
  - tool calls go through allowlists,
  - usage is persisted,
  - realtime events remain compatible.
- [ ] Add workflow version/config version to `AgentRun.configSnapshot`.
- [ ] Add tests for:
  - default agent uses default graph,
  - custom workflow uses compiled graph,
  - invalid saved workflow fails safely,
  - disabled tool cannot be executed even if graph references it,
  - conditional path chooses expected branch,
  - terminal failure persists run status,
  - retry does not duplicate completed workflow nodes.

Acceptance: saved visual workflows can safely control agent execution without bypassing existing tenant, tool, budget, persistence, and realtime safeguards.

## PR 34: Full-runtime Golden Set Evaluation

- [ ] Keep the current fast evaluator as `FAST_LLM_ONLY`.
- [ ] Add a `FULL_AGENT_RUNTIME` evaluation mode.
- [ ] In full-runtime mode, each golden case should:
  - create an `AgentRun`,
  - execute the same LangGraph runtime as a normal user request,
  - wait for terminal state,
  - evaluate final assistant content,
  - evaluate expected sources,
  - record tool calls used,
  - record workflow/config version,
  - record usage, latency, and terminal error code.
- [ ] Extend evaluation results with:
  - runtime mode,
  - agent run ID,
  - workflow version,
  - tool calls used,
  - terminal status,
  - error code/message preview.
- [ ] Add UI entry for Evaluations, since the dashboard still treats Evaluations as planned.
- [ ] Add tests for:
  - expected fact pass/fail,
  - forbidden claim pass/fail,
  - expected source pass/fail,
  - retrieval miss,
  - disabled tool regression,
  - graph failure,
  - budget failure,
  - Gmail missing connection,
  - usage regression.

Acceptance: golden set evaluation can catch regressions in prompts, retrieval, tools, graph routing, workflow definitions, usage, and source grounding.

## PR 35: Usage and Observability Optimization

- [ ] Ensure every model generation path writes authoritative `TokenUsage`.
- [ ] Remove or deprecate direct chat usage that only lives in `Message` rows.
- [ ] Add a `ToolAuditSink` implementation for worker MCP calls so tool audits are persisted, not only defined in the registry abstraction.
- [ ] Optimize `PrismaUsageRepository.summarize` for larger tenants:
  - keep current in-memory aggregation for local MVP,
  - add DB-level aggregation or cursor windows when records exceed the current 5000-row cap,
  - document local MVP limits.
- [ ] Add run-level observability:
  - selected workflow version,
  - selected template key,
  - tool call count,
  - retrieval hit count,
  - final answer token count,
  - model latency.
- [ ] Ensure previews remain bounded:
  - tool inputs,
  - tool outputs,
  - RSS entries,
  - Gmail message snippets,
  - document chunks.
- [ ] Add tests for:
  - usage summary includes worker chat,
  - usage summary excludes foreign tenants,
  - tool audit records success/failure/denied,
  - large usage datasets do not break summary,
  - preview limits are enforced.

Acceptance: usage and audit views reflect the actual agent runtime path and remain reliable as local datasets grow.

## PR 36: Release Readiness and End-to-End Command Center Flow

- [ ] Add E2E coverage for the complete command center:
  - register/login,
  - install templates,
  - upload/index knowledge,
  - ask Knowledge Researcher,
  - configure RSS feed,
  - run Daily News Briefing,
  - connect or simulate Gmail,
  - create/review/reject/send draft through API review path,
  - inspect run timeline,
  - inspect usage summary,
  - run full-runtime golden evaluation.
- [ ] Add accessibility pass for:
  - home dashboard,
  - agent workspace,
  - run timeline,
  - Gmail review queue,
  - news workspace,
  - workflow visualizer/editor.
- [ ] Update docs:
  - architecture,
  - local development,
  - API contracts,
  - RAG/MCP,
  - security,
  - testing,
  - demo script,
  - portfolio release notes.
- [ ] Remove stale claims from docs where implementation differs.
- [ ] Verify the documented demo from a clean checkout.
- [ ] Run and record:
  - `npm run format:check`,
  - `npm run lint`,
  - `npm run typecheck`,
  - `npm run test`,
  - `npm run build`,
  - integration/E2E suites where available.
- [ ] Tag `v0.1.0` only after owner review.

Acceptance: the application works as a coherent local-first AI command center where the default user flow, durable runtime, templates, tools, timeline, usage, and evaluation all exercise the same architecture.
