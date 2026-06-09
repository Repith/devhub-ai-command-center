# Domain Model

## Aggregate Overview

`Tenant` is the ownership boundary. `AgentDefinition` owns configuration but
references tools and knowledge bases through tenant-scoped associations.
`Conversation` owns ordered messages. `AgentRun` owns immutable execution input
and an ordered sequence of `AgentRunStep` records. `Document` owns chunks as
relational metadata while Qdrant stores their vectors.

## Core Entities

| Entity | Responsibility |
| --- | --- |
| User | Global identity and credential owner |
| Tenant | Workspace and data-isolation boundary |
| Membership | User role inside a tenant |
| AgentDefinition | Prompt, provider, model, tools, knowledge, limits |
| Conversation | Tenant-scoped message thread |
| AgentRun | One durable execution request |
| AgentRunStep | One retrieval, model, tool, or output operation |
| Document | Uploaded file and ingestion lifecycle |
| DocumentChunk | Searchable text fragment and vector reference |
| TokenUsage | Provider usage and latency attributed to a run step |
| GoldenCase | Expected facts, forbidden claims, and expected sources |
| EvaluationRun | Versioned batch evaluation |

## Closed Status Types

- Document: `UPLOADED`, `PROCESSING`, `INDEXED`, `FAILED`, `DELETING`.
- Agent run: `QUEUED`, `RUNNING`, `COMPLETED`, `FAILED`, `CANCEL_REQUESTED`,
  `CANCELLED`, `TIMED_OUT`.
- Run step: `PENDING`, `RUNNING`, `COMPLETED`, `FAILED`, `SKIPPED`.
- Evaluation: `QUEUED`, `RUNNING`, `COMPLETED`, `FAILED`.

Transitions are validated in domain policies. Terminal states cannot return to
active states. Retried jobs resume from persisted completed steps and may not
duplicate externally visible effects.

## Tenant Invariants

- Every tenant-owned row contains a non-null `tenantId`.
- Relations between tenant-owned entities must share the same tenant.
- Repositories require an authenticated tenant context.
- Qdrant payloads contain `tenantId`, `documentId`, `chunkId`, and document
  status metadata.
- Queue payloads include tenant context for lookup, but authorization is
  revalidated against persisted ownership.
- Tenant identifiers supplied by clients are ignored or rejected.

## Usage Invariants

Usage is append-only per model operation. Local providers have zero monetary
cost but still report tokens, duration, retries, provider, and model. Budget
checks occur before an operation and again after actual usage is known.
