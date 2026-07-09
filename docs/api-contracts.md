# API Contracts

## Conventions

All endpoints use `/api/v1`. JSON fields use camelCase, timestamps use ISO 8601
UTC, and identifiers are UUID strings. Protected endpoints derive `userId`,
`tenantId`, and roles from a verified access token.

Successful list responses use:

```json
{
  "data": [],
  "page": { "cursor": null, "nextCursor": null, "limit": 20 }
}
```

Errors use:

```json
{
  "code": "DOCUMENT_NOT_FOUND",
  "message": "Document was not found.",
  "details": {},
  "correlationId": "01J..."
}
```

## Authentication

- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/logout`
- `GET /me`

Registration creates a user, tenant, owner membership, and refresh session in
one transaction. Refresh tokens rotate on use, are stored as hashes, and are
transported in a scoped `HttpOnly` cookie. Login may select a tenant by slug;
when omitted, the oldest membership is used. `/me` returns the persisted active
membership selected by the verified access token and session.

## Agents and Conversations

- `GET|POST /agents`
- `GET /agents/templates`
- `POST /agents/templates/install`
- `POST /agents/templates/reset`
- `GET|PATCH|DELETE /agents/:agentId`
- `POST /agents/:agentId/runs`
- `GET /conversations`
- `GET /conversations/:conversationId`
- `GET /conversations/:conversationId/messages`
- `POST /agents/:agentId/chat`

Agent input contains name, description, model configuration, system prompt,
limits, enabled tool identifiers, and selected knowledge base identifiers.
List and detail responses intentionally omit `tenantId`; ownership remains
server-side authorization context. Owners and admins may create, update, and
soft-delete definitions. Members have read-only access inside their tenant.
Template-owned definitions include a nullable `templateKey` and a
`templateSetup` list so the UI can show whether supporting integrations are
ready, planned, or need setup. Browser input cannot set `templateKey`.

Template install creates missing default definitions and revives deleted
template-owned definitions without overwriting active user edits. Template reset
intentionally restores only template-owned definitions from code defaults.

Agent-backed user interactions should create durable runs through
`POST /agents/:agentId/runs`. Run creation accepts a message and an optional
existing conversation identifier. The API derives tenant context from the
authenticated principal, creates or reuses the conversation inside the current
tenant, persists the user message, stores the effective `conversationId` in the
run input snapshot, and enqueues worker execution.

`POST /agents/:agentId/chat` remains a compatibility endpoint for older browser
surfaces. It is marked as a direct-chat compatibility path in response headers
and should not be used for new agent-backed flows.

Conversation and message responses never expose `tenantId`.

## Runs

- `GET /agent-runs`
- `GET /agent-runs/:runId`
- `GET /agent-runs/:runId/steps`
- `POST /agent-runs/:runId/cancel`

Run creation returns `201 Created` with the persisted run snapshot. Cancellation
is idempotent and returns the latest state.

Worker-backed runs persist the full assistant answer as a conversation message
after `llm.generate` completes. `AgentRunStep.outputPreview` is a bounded
preview for timelines and audits, not the authoritative copy of the answer.
The assistant message token fields and the corresponding `TokenUsage` row are
written in the same database transaction.

## Knowledge

- `GET /documents`
- `POST /documents/upload`
- `GET|DELETE /documents/:documentId`
- `POST /documents/:documentId/reindex`
- `POST /knowledge/search`

Uploads accept MD, TXT, and PDF up to the configured limit. Retrieval returns
ranked chunks with document, page when available, score, and citation label.

## Gmail

- `GET /integrations`
- `GET /gmail/status`
- `POST /gmail/connect`
- `POST /gmail/dev/connect`
- `POST /gmail/oauth/callback`
- `DELETE /gmail/disconnect`
- `GET|POST /gmail/draft-reviews`
- `PATCH /gmail/draft-reviews/:reviewId`
- `POST /gmail/draft-reviews/:reviewId/send`
- `POST /gmail/draft-reviews/:reviewId/reject`

Gmail OAuth responses expose connection state, account email, required scopes,
missing configuration key names, and timestamps, but never access or refresh
tokens. `POST /gmail/dev/connect` is enabled only by local mock configuration
and creates a simulated connection for demos. `DELETE /gmail/disconnect`
clears server-held Gmail tokens for the authenticated tenant/user and returns
the same secret-safe status shape as `GET /gmail/status`. Draft review responses omit
`tenantId` and include recipients, subject, body, and the closed status union
`NEEDS_REVIEW | UPDATED | SENT | REJECTED` because those fields are explicitly
shown to the authenticated user before sending. Sending mail is only available
through the authenticated API review endpoint; it is not an MCP tool.

`GET /integrations` returns a shared status list for Gmail and GitHub:

```json
{
  "data": [
    {
      "provider": "GMAIL",
      "status": "DISCONNECTED",
      "accountLabel": null,
      "scopes": [],
      "missingConfigKeys": [],
      "connectedAt": null,
      "updatedAt": null
    },
    {
      "provider": "GITHUB",
      "status": "MISCONFIGURED",
      "accountLabel": null,
      "scopes": [],
      "missingConfigKeys": ["GITHUB_APP_ID"],
      "connectedAt": null,
      "updatedAt": null
    }
  ]
}
```

The response is additive and secret-safe: `missingConfigKeys` contains key
names only, never values.

## News Feeds

- `GET|POST /news/feeds`
- `PATCH|DELETE /news/feeds/:feedId`

News feed responses expose name, URL, topic, enabled flag, and last fetch
metadata, but never `tenantId`. Owners and admins manage tenant-owned RSS
sources; members may inspect them. Agent runs may pass `newsFeedIds` to select
configured feeds, while the Daily News Briefing template uses enabled tenant
feeds by default.

## MCP, Usage, and Evaluation

- `GET /mcp/connections`
- `POST /mcp/connections`
- `GET /mcp/tools`
- `POST /mcp/tools/call` for development diagnostics only
- `GET /usage?period=24h|7d|30d|all`
- `GET /golden-cases`
- `POST /golden-cases`
- `POST /evaluations`
- `GET /evaluations/:evaluationId`

Direct diagnostic tool calls require elevated owner authorization and are
recorded in the audit log.

Usage responses are dashboard-ready summaries derived only from persisted
`TokenUsage` rows in the authenticated tenant. They include tenant totals,
time-period buckets, agent totals, run totals, provider/model totals, recent
expensive runs, and budget warnings calculated from each run's persisted config
snapshot. The internal `usage.summary` MCP capability exposes the same
persisted summary to the Usage Analyst agent and never estimates authoritative
token totals from prompt text.
