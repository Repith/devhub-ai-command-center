# ADR 0004: BullMQ for Background Jobs

Status: Accepted

Use BullMQ and Redis for document ingestion, agent execution, and evaluations.
Jobs use deterministic identifiers, bounded retries, exponential backoff,
timeouts, and persisted state for idempotency. BullMQ expresses commands to do
work; it is not treated as the source of truth.
