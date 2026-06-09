# RAG and MCP

## Document Ingestion

1. Validate extension, MIME type, size, and filename.
2. Store the file outside PostgreSQL and create a `Document` record.
3. Enqueue `process-document:<tenantId>:<documentId>:<version>`.
4. Parse MD, TXT, or PDF with a bounded timeout.
5. Normalize text while preserving headings, paragraphs, lists, and page data.
6. Split semantically, then enforce a target of 500-900 tokens with 80-150
   tokens of overlap.
7. Generate embeddings through Ollama.
8. Persist chunks in PostgreSQL and vectors in Qdrant.
9. Mark the document `INDEXED` only after both stores succeed.

Reindexing creates a new document version and swaps active vectors
idempotently. Deletion removes vectors before final metadata removal.

## Retrieval

The query is embedded with the same model and searched in Qdrant using mandatory
tenant and active-document filters. The first version returns top-K chunks
without reranking. The prompt instructs the model to answer from supplied
context, state when evidence is insufficient, and attach stable citation labels.

PostgreSQL remains authoritative for access and source metadata. A Qdrant result
is discarded if its relational record is missing, inactive, or unauthorized.

## MCP Tooling

The knowledge server exposes `knowledge.search`; the news server exposes
`news.fetch_rss`. The worker connects through the official TypeScript MCP SDK
and a `ToolRegistryPort`. Tool discovery does not grant permission: each agent
stores an explicit allowlist.

Every call validates schema, tenant scope, timeout, output size, and call count.
Inputs and bounded output previews are stored as run steps. Secrets are resolved
inside adapters and never included in model-visible tool arguments.

## Untrusted Content

Uploaded documents, RSS entries, retrieved chunks, and MCP output may contain
prompt injection. They are wrapped as quoted data, not instructions. Tool output
cannot modify system policy, expand the allowlist, access credentials, or invoke
another tool directly.
