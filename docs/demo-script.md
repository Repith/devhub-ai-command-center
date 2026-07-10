# Demo Script

This script verifies the `v0.1.0` local portfolio slice from a clean checkout.
It assumes Docker Desktop, Node.js 22+, npm 11, and Ollama are installed.

## 1. Start The Local Stack

Run the setup once, then keep the API, worker, and web app running in the host
process.

```bash
npm install
npm run setup
ollama pull qwen3:8b
ollama pull nomic-embed-text
npm run dev
```

Open `http://localhost:3000`, register a user, and create the first workspace.
The API should log JSON `http_request` records with `correlationId`, method,
path, status code, and duration. PostgreSQL, Redis, and Qdrant run through
Docker Compose.

## 2. Install Templates And Check Setup State

Open the command center and install the default templates if they are not
already present. The tenant should have Knowledge Researcher, Daily News
Briefing, Gmail Triage, Gmail Reply Assistant, Usage Analyst, and Repository
Researcher agents.

Open the Agents workspace. Template setup should reflect current tenant state:
Knowledge needs indexed documents, Daily News needs enabled RSS feeds, Gmail
templates need a Gmail connection or show a misconfigured state when OAuth
environment variables are missing, Repository Researcher needs a GitHub
connection with synced repositories, and Usage Analyst should be ready.

Open `/api/v1/audit-log` through the browser session or an authenticated API
client. The tenant audit log should show template install/reset actions and
agent mutations without exposing prompt bodies, JWTs, refresh tokens, Gmail
payloads, or tenant identifiers.

## 3. Upload Knowledge

Upload one Markdown, text, PDF, JPEG, PNG, or WebP file. The API accepts only
the supported MIME types and matching extensions. PDF uploads must start with a
valid `%PDF-` signature; text uploads must be valid UTF-8 and cannot contain
binary NUL bytes. Images and text-poor scanned PDFs route through the configured
OCR model.

Watch the worker process the `process-document` job. The document moves through
upload, parsing, chunking, embedding, and indexing. Search from the Knowledge
or Runs workflow should return citations with document and chunk identifiers.

## 4. Ask Knowledge Researcher

Ask Knowledge Researcher from the home dashboard. The browser should call
`POST /api/v1/agents/:agentId/runs`, not the legacy direct chat path. The API
enqueues `run-agent`, the worker executes retrieval and generation, and
Socket.IO streams step changes and token deltas. Refresh the page during a run;
the UI recovers by loading the REST snapshot and then continuing the event
stream.

Start another run that exceeds the token budget. The run should fail with
`TOKEN_BUDGET_EXCEEDED`, while usage still records provider, model, input
tokens, output tokens, latency, and retry count.

## 5. Configure RSS And Run Daily News

Create an enabled RSS feed in the News workspace, then run Daily News Briefing
with the configured feed selected. The run should fetch only tenant-owned feed
configuration, treat feed entries as untrusted input, summarize with links, and
record tool audit rows for the worker MCP calls.

## 6. Connect Or Simulate External Integrations

Open the Integrations workspace. If Gmail OAuth is configured, connect Gmail
from the Gmail card or the Gmail setup prompt. If OAuth is not configured on the
machine, keep the template in `MISCONFIGURED` setup state and use
`GMAIL_DEV_MOCK_ENABLED=true` when validating the local review path.

Run Gmail Reply Assistant with an explicit thread ID. The worker may create or
update a Gmail draft, but sending remains an authenticated API action. Open the
Gmail review queue, edit the draft, reject one draft, and send another only
through `POST /api/v1/gmail/draft-reviews/:reviewId/send`. Audit metadata must
not include the message body.

If GitHub App credentials are configured, connect GitHub from the GitHub card,
finish the browser callback, install the app on a test repository, and run
repository sync. If credentials are not configured, use the mocked E2E path or a
seeded local installation to validate read tools without external calls.

Run Repository Researcher against the synced repository. The worker should use
only read-only GitHub MCP tools such as `github.list_repositories`,
`github.get_file`, `github.search_code`, `github.list_issues`, and
`github.list_pull_requests`. Create a GitHub action review for an issue or pull
request comment, edit it, reject one review, and submit another only through the
authenticated action-review API. The agent must never publish GitHub writes
directly through MCP.

## 7. Evaluate The Golden Set

Use the release wrapper to start the seeded golden set in full-runtime mode:

```bash
DEVHUB_ACCESS_TOKEN=<access-token> npm run eval:golden
```

The wrapper calls the same evaluation API and waits for a terminal report by
default. To start the run without polling, set `EVAL_GOLDEN_WAIT=false`.
Equivalent API call:

```bash
curl -X POST http://localhost:4000/api/v1/evaluations/golden-set \
  -H "Authorization: Bearer <access-token>" \
  -H "Content-Type: application/json" \
  -d "{\"mode\":\"FULL_AGENT_RUNTIME\"}"
```

The worker consumes `evaluate-golden-set` and writes a report with pass/fail,
score, latency, token usage, retrieval hit, tool calls used, workflow version,
terminal status, and config version. The seeded cases cover RAG, MCP, budget
behavior, realtime recovery, Gmail missing setup, GitHub missing setup, saved
workflow execution, and tenant isolation.

## 8. Review Hardening Evidence

Confirm these checks before tagging `v0.1.0`:

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run test:integration
npm run test:e2e
npm run eval:golden
npm audit --omit=dev
```

`npm run test:integration` requires `DATABASE_URL` and skips database-backed
suites when the local infrastructure is unavailable. `npm run eval:golden`
requires `DEVHUB_ACCESS_TOKEN` plus the local API, worker, Redis, PostgreSQL,
Qdrant, and Ollama stack.
