# Security

## Trust Boundaries

Untrusted inputs enter through browser requests, uploaded files, WebSocket
messages, retrieved document text, RSS content, MCP output, and model output.
PostgreSQL authorization checks and application policies form the primary
enforcement boundary.

## Identity and Sessions

Passwords use Argon2id with application-defined parameters. Short-lived access
JWTs carry subject, active tenant, role, session identifier, issuer, audience,
and expiry. Refresh tokens are opaque, delivered only through a scoped
`HttpOnly` and `SameSite=Strict` cookie, rotated on every use, stored only as
SHA-256 hashes, and revoked on logout or detected reuse. Reuse revokes the
entire refresh-token family.

The web application keeps access tokens only in React memory. It restores a
session through the scoped refresh cookie after reload and proxies `/api/v1`
through the Next.js origin so browser code never reads the refresh token.

## Tenant Isolation

Every repository call accepts server-derived tenant context. Foreign resources
return a generic not-found response. WebSocket rooms, BullMQ jobs, Qdrant
filters, MCP calls, usage queries, and evaluation cases all enforce the same
boundary. Cross-tenant tests are release blockers.

Usage summaries and the `usage.summary` MCP capability read persisted
`TokenUsage` rows with the same server-derived tenant context. They do not
accept browser-supplied tenant identifiers and do not estimate authoritative
token totals from prompt or response text.

LangGraph nodes run inside the worker with the same server-derived context.
Graph state cannot accept tenant identifiers, tool permissions, or resource
ownership from the browser. A graph node must reload or validate persisted
ownership before touching tenant-owned data.

## Files and Retrieval

Uploads use an allowlist for MD, TXT, and PDF, a configurable size limit,
generated storage keys, and filenames treated as display metadata only. PDF
uploads must include the `%PDF-` signature. Text uploads must be valid UTF-8 and
cannot include binary NUL bytes. Parsers run with time and memory limits.
Retrieved content is untrusted and cannot alter agent policy.

## Secrets and Logging

Secrets live in environment variables and are never committed. Logs use
structured fields and redact authorization headers, cookies, refresh tokens,
passwords, tool credentials, and document bodies. Prompt and tool previews are
bounded and configurable.

OAuth refresh tokens for Gmail must be encrypted at rest and never included in
prompts, tool arguments visible to the model, WebSocket events, run-step
previews, or audit metadata. Gmail message bodies are treated like uploaded
documents and RSS content: untrusted, bounded, and incapable of changing system
policy or tool permissions.

External integration status responses may include provider names, account
labels, scopes, timestamps, and missing configuration key names. They must not
include OAuth access tokens, refresh tokens, token encryption keys, GitHub App
private keys, webhook secrets, or raw provider payloads. Shared token crypto is
server-side only and is used for encrypted token storage before provider tools
or workers can access external APIs.

Tenant RSS feed URLs are owned server-side and selected by feed ID in agent
runs. Browser requests cannot provide a tenant identifier for feeds, and the
worker reloads configured feeds with tenant context before fetching. RSS titles,
summaries, and links are untrusted data; they may be summarized and cited, but
cannot alter graph routing, tool allowlists, or authorization policy.

The local Gmail OAuth flow requires `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`,
`GMAIL_REDIRECT_URI`, and `GMAIL_TOKEN_ENCRYPTION_KEY`. The first implementation
requests `https://www.googleapis.com/auth/gmail.readonly` and
`https://www.googleapis.com/auth/gmail.compose`. These are Google restricted
scopes, so a public production deployment must complete Google's verification
and security assessment process before broad use. Local development should use
test users and never commit OAuth credentials. Disconnecting Gmail clears the
encrypted access and refresh tokens server-side and records only provider
metadata in audit logs.

GitHub App production configuration requires `GITHUB_APP_ID`,
`GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_PRIVATE_KEY`,
`GITHUB_WEBHOOK_SECRET`, `GITHUB_REDIRECT_URI`, and
`GITHUB_TOKEN_ENCRYPTION_KEY`. Repository access must be scoped to tenant-owned
installations. OAuth user tokens are encrypted in `ExternalConnection`; GitHub
installation and repository tables contain metadata only. Webhooks must verify
the GitHub HMAC signature before changing installation status. GitHub read
tools use server-side token providers and tenant-owned repository metadata; the
model receives only validated, bounded tool results and never receives OAuth
tokens, installation tokens, private keys, or raw provider payloads. GitHub tool
audit previews are redacted so repository content is not copied into logs or
audit metadata.

GitHub write actions are review records, not MCP tools. A model may propose an
issue comment, pull request comment, or issue creation draft only by producing
content for an authenticated API review record. Submission requires a separate
user request and revalidates tenant, user, review state, and active
tenant-owned repository access before GitHub is called. Audit metadata for
review submit and reject records the action shape and target, never the draft
body.

The model may prepare Gmail drafts but may not send mail through MCP in the
first Gmail workflow. Sending requires an authenticated API request against a
local review record whose recipients, subject, and body are visible and
editable by the user. Any later auto-send mode must be disabled by default and
guarded by explicit UI confirmation, sender allowlists, narrow categories, and
auditable policy decisions.

## Rate Limits and Audit Trail

The local API applies an in-memory rate limit by client address, HTTP method,
and route path. It is suitable for the single-process local MVP and documents
the enforcement behavior; production should use a shared Redis limiter.

Tenant audit logs record resource mutations and security-relevant actions such
as agent changes, document uploads and searches, run starts and cancellations,
golden-case updates, and evaluation starts. Audit responses omit tenant IDs and
are available only to owner/admin roles in the active tenant.

OAuth callback failures use the shared error envelope and include the
request's correlation ID. Operators should use that ID to match browser-visible
errors to structured API request logs. Server stack traces and provider error
details stay server-side.

## Threat Model Priorities

- Broken tenant authorization.
- Refresh-token theft or replay.
- Prompt injection causing unauthorized tool use.
- Prompt injection causing unauthorized graph routing or email sending.
- Malicious or oversized document uploads.
- Resource exhaustion through runs, tools, parsers, or sockets.
- Sensitive data exposure through logs and realtime events.

Controls include schema validation, allowlists, rate limits, timeouts, budgets,
idempotency, output limits, audit trails, and least-privilege adapters.
