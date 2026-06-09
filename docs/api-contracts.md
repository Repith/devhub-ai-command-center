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
- `GET|PATCH|DELETE /agents/:agentId`
- `POST /agents/:agentId/runs`
- `GET /conversations`
- `GET /conversations/:conversationId`
- `GET /conversations/:conversationId/messages`

Agent input contains name, description, model configuration, system prompt,
limits, enabled tool identifiers, and selected knowledge base identifiers.

## Runs

- `GET /agent-runs`
- `GET /agent-runs/:runId`
- `GET /agent-runs/:runId/steps`
- `POST /agent-runs/:runId/cancel`

Run creation returns `202 Accepted` with the persisted run snapshot. Cancellation
is idempotent and returns the latest state.

## Knowledge

- `GET /documents`
- `POST /documents/upload`
- `GET|DELETE /documents/:documentId`
- `POST /documents/:documentId/reindex`
- `POST /knowledge/search`

Uploads accept MD, TXT, and PDF up to the configured limit. Retrieval returns
ranked chunks with document, page when available, score, and citation label.

## MCP, Usage, and Evaluation

- `GET /mcp/connections`
- `POST /mcp/connections`
- `GET /mcp/tools`
- `POST /mcp/tools/call` for development diagnostics only
- `GET /usage/tokens`
- `GET /usage/agent-runs`
- `GET /golden-cases`
- `POST /golden-cases`
- `POST /evaluations`
- `GET /evaluations/:evaluationId`

Direct diagnostic tool calls require elevated owner authorization and are
recorded in the audit log.
