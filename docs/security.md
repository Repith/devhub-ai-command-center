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

## Rate Limits and Audit Trail

The local API applies an in-memory rate limit by client address, HTTP method,
and route path. It is suitable for the single-process local MVP and documents
the enforcement behavior; production should use a shared Redis limiter.

Tenant audit logs record resource mutations and security-relevant actions such
as agent changes, document uploads and searches, run starts and cancellations,
golden-case updates, and evaluation starts. Audit responses omit tenant IDs and
are available only to owner/admin roles in the active tenant.

## Threat Model Priorities

- Broken tenant authorization.
- Refresh-token theft or replay.
- Prompt injection causing unauthorized tool use.
- Malicious or oversized document uploads.
- Resource exhaustion through runs, tools, parsers, or sockets.
- Sensitive data exposure through logs and realtime events.

Controls include schema validation, allowlists, rate limits, timeouts, budgets,
idempotency, output limits, audit trails, and least-privilege adapters.
