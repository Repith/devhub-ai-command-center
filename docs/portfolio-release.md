# Portfolio Release

`v0.1.0` is the local-first portfolio release for DevHub AI Command Center. It
shows the complete learning path for a small multi-tenant agent platform without
depending on cloud model APIs.

## Release Slice

The release includes tenant registration, JWT and refresh-token rotation, agent
configuration, Ollama chat, document ingestion, embeddings, Qdrant retrieval,
MCP tools, durable BullMQ runs, Socket.IO timelines, usage budgets, golden-set
evaluation, structured request logs, rate limits, upload hardening, and tenant
audit views.

```mermaid
flowchart LR
  Browser[Next.js dashboard] --> API[NestJS API]
  API --> Postgres[(PostgreSQL)]
  API --> Redis[(Redis)]
  API --> Qdrant[(Qdrant)]
  Redis --> Worker[BullMQ worker]
  Worker --> Ollama[Ollama]
  Worker --> MCP[MCP tools]
  Worker --> Postgres
  Worker --> Qdrant
  Worker --> Redis
```

The demo runs locally through Docker Compose for PostgreSQL, Redis, and Qdrant.
Next.js, the API, the worker, MCP servers, and Ollama run on the host to keep
iteration fast and GPU access simple.

## Hardening Notes

Rate limiting is an in-memory process guard intended for the local MVP. It
limits requests by IP, method, and path and returns the same error envelope as
the rest of the API. A production deployment should replace it with a shared
Redis-backed limiter so multiple API instances enforce one budget.

Structured request logs are JSON and include correlation ID, method, path,
status, and duration. They deliberately avoid request bodies, cookies,
authorization headers, refresh tokens, prompts, uploaded document text, and tool
outputs.

The audit view stores tenant-scoped security events for resource mutations and
search actions. It records action, resource type, resource ID, metadata, and
timestamp. Browser-supplied tenant IDs are never accepted.

Upload hardening keeps the allowlist narrow: Markdown, text, and PDF only.
Filenames are display metadata, storage keys are generated, PDF files need the
`%PDF-` signature, and text files must be valid UTF-8 without binary NUL bytes.

## Trade-Offs

Deployment, SSO, organization invitations, billing, hosted observability,
distributed rate limiting, full RBAC policy editing, and LangGraph-style agent
graphs are intentionally left outside `v0.1.0`. The release favors explicit
ports, queues, DTOs, and repositories so a reader can trace every behavior from
browser request to database record.

The golden evaluator is intentionally rule-based. It is repeatable and easy to
audit, but it cannot judge writing quality or nuanced semantic equivalence. A
future release can add model-graded evaluation as a separate evaluator type
without replacing the deterministic baseline.

Screenshots should be captured from a local run after PR #14 is merged: Agents,
Chat, Document upload, Runs timeline, Usage, Audit log, and Evaluation report.
The demo script in [demo-script.md](demo-script.md) defines the capture path.
