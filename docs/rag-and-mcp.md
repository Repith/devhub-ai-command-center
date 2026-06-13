# RAG and MCP

## Document Ingestion

1. The API validates extension, MIME type, size, filename, and basic content
   signature.
2. The source file is stored under `DOCUMENT_STORAGE_DIR`.
3. PostgreSQL receives a `Document` row with status `UPLOADED`.
4. The API enqueues `process-document:<tenantId>:<documentId>:<version>` in
   Redis through BullMQ.
5. `apps/worker` marks the document `PROCESSING`.
6. MD and TXT files are normalized directly.
7. PDF files are parsed with `pdf-parse`; if native text extraction is too
   sparse, the worker renders pages to PNG and runs OCR.
8. Image uploads are routed directly to OCR.
9. `packages/rag` chunks the extracted text into retrieval units.
10. Chunks are stored in PostgreSQL as `DocumentChunk` rows.
11. Ollama generates embeddings with `OLLAMA_EMBEDDING_MODEL`.
12. Qdrant stores vectors in `QDRANT_COLLECTION_NAME` with tenant and document
    payload filters.
13. The worker marks the document `INDEXED` only after PostgreSQL chunks and
    Qdrant vectors both succeed.

Reindexing creates a new document version and swaps active vectors
idempotently. Deletion removes vectors before final metadata removal.

If a document remains `UPLOADED`, the API accepted the file but the worker has
not processed the job yet. Confirm that `npm run dev` is running the worker and
that Redis is available. If the status becomes `FAILED`, inspect the document
failure code/detail in the UI and the worker log line for the same document ID.
Common local failures are a missing Ollama embedding or OCR model, Qdrant being
unavailable, Redis being unavailable, or an image/PDF whose text cannot be read
by the configured OCR model.

## OCR Routing

The worker decides which extraction tool to use before indexing:

- text and Markdown: direct UTF-8 normalization
- text-rich PDF: native `pdf-parse` text extraction
- scanned or text-poor PDF: PDF page screenshot rendering plus OCR
- JPEG, PNG, WebP: OCR

Local OCR defaults:

- `OLLAMA_OCR_MODEL=qwen2.5vl:7b`
- `OCR_TIMEOUT_MS=120000`
- `OCR_PDF_MAX_PAGES=8`
- `OCR_TEXT_MIN_CHARACTERS=120`
- `OCR_TEXT_MIN_WORDS=20`

Install the default OCR model with:

```bash
ollama pull qwen2.5vl:7b
```

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

LangGraph graph nodes may call MCP tools only through `ToolRegistryPort`. A
graph edge cannot widen the agent allowlist, skip schema validation, reuse tool
output as instructions, or expose adapter secrets to the model. Tool outputs
remain untrusted data even when they are produced inside a graph node.

The Gmail integration uses a local `apps/mcp-gmail` server for
`gmail.search_threads`, `gmail.get_thread`, `gmail.create_draft`, and
`gmail.update_draft`. The server reads credentials from server-side runtime
configuration only. Sending mail is deliberately outside the MCP tool surface in
the first version; it is an authenticated API action tied to a review record
that the user can inspect and edit.

RSS remains the first news provider. Tenant feed configuration owns the set of
URLs the briefing agent may read, and feed entries are bounded before they enter
prompts or previews.

## Untrusted Content

Uploaded documents, RSS entries, retrieved chunks, and MCP output may contain
prompt injection. They are wrapped as quoted data, not instructions. Tool output
cannot modify system policy, expand the allowlist, access credentials, or invoke
another tool directly.
