# RAG and MCP

## Document Ingestion

1. The API validates extension, MIME type, size, filename, and basic content
   signature.
2. The source file is stored under `DOCUMENT_STORAGE_DIR`.
3. PostgreSQL receives a `Document` row with status `UPLOADED`.
4. The API enqueues `process-document:<tenantId>:<documentId>:<version>` in
   Redis through BullMQ.
5. `apps/worker` marks the document `PROCESSING`.
6. MD and TXT files are normalized directly; PDFs are parsed with `pdf-parse`.
7. `packages/rag` chunks the extracted text into retrieval units.
8. Chunks are stored in PostgreSQL as `DocumentChunk` rows.
9. Ollama generates embeddings with `OLLAMA_EMBEDDING_MODEL`.
10. Qdrant stores vectors in `QDRANT_COLLECTION_NAME` with tenant and document
    payload filters.
11. The worker marks the document `INDEXED` only after PostgreSQL chunks and
    Qdrant vectors both succeed.

Reindexing creates a new document version and swaps active vectors
idempotently. Deletion removes vectors before final metadata removal.

If a document remains `UPLOADED`, the API accepted the file but the worker has
not processed the job yet. Confirm that `npm run dev` is running the worker and
that Redis is available. If the status becomes `FAILED`, inspect the document
failure code/detail in the UI and the worker log line for the same document ID.
Common local failures are a missing Ollama embedding model, Qdrant being
unavailable, Redis being unavailable, or a PDF with no extractable text.

## Retrieval

The query is embedded with the same model and searched in Qdrant using mandatory
tenant and active-document filters. The first version returns top-K chunks
without reranking. The prompt instructs the model to answer from supplied
context, state when evidence is insufficient, and attach stable citation labels.

PostgreSQL remains authoritative for access and source metadata. A Qdrant result
is discarded if its relational record is missing, inactive, or unauthorized.
The UI only enables retrieval testing for documents with status `INDEXED`;
searching an empty or not-yet-created Qdrant collection returns zero results
rather than a server error.

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
