# OAuth Integrations

## Shared OAuth Broker

Local installations can use the public `apps/oauth-broker` service instead of
storing provider application credentials. Set only `OAUTH_BROKER_URL` in the
root `.env`; the existing `JWT_SECRET` becomes the local token-encryption root.
Provider secrets and account allowlists belong exclusively to the broker.

Deploy the included `render.yaml` and configure `OAUTH_BROKER_PUBLIC_ORIGIN`,
`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_ALLOWED_EMAILS`,
`GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, and `GITHUB_ALLOWED_LOGINS` in
Render. Register these callbacks with the providers:

```text
https://<broker-domain>/api/v1/broker/callback/gmail
https://<broker-domain>/api/v1/broker/callback/github
```

The local API creates a PKCE verifier, the broker validates the provider
identity against its allowlist, and the local API redeems a two-minute,
single-use code. Provider tokens are never added to browser URLs or broker
logs. The current in-memory grant store requires a single broker instance;
move pending sessions to Redis before scaling horizontally.

## Runtime Model

Gmail and GitHub are user-authorized integrations scoped by the active tenant.
The browser starts OAuth, but tokens are exchanged, encrypted, refreshed, and
used only server-side. Agents receive validated MCP tool results and never see
OAuth access tokens, refresh tokens, GitHub App private keys, webhook secrets,
or raw provider payloads.

`GET /api/v1/integrations` is the operator-facing setup check. It returns
`CONNECTED`, `DISCONNECTED`, `EXPIRED`, or `MISCONFIGURED` for Gmail and
GitHub, plus account labels, scopes, timestamps, and missing environment key
names. Missing key values are never returned.

All OAuth callback errors use the shared API error envelope with a stable
`code` and `correlationId`. Browser mutation errors should display both values
so local operators can match UI failures to API logs.

## Google Cloud Gmail OAuth

Create a Google Cloud project, configure the OAuth consent screen, and add test
users for local development. Create a Web application OAuth client with this
redirect URI for local runs:

```text
http://localhost:3000/gmail/oauth/callback
```

Production must use the deployed web origin:

```text
https://<domain>/gmail/oauth/callback
```

Set these variables in `.env`:

```bash
GMAIL_CLIENT_ID=<google-oauth-client-id>
GMAIL_CLIENT_SECRET=<google-oauth-client-secret>
GMAIL_REDIRECT_URI=http://localhost:3000/gmail/oauth/callback
GMAIL_TOKEN_ENCRYPTION_KEY=<random-secret>
GMAIL_DEV_MOCK_ENABLED=false
```

The application requests `https://www.googleapis.com/auth/gmail.readonly` and
`https://www.googleapis.com/auth/gmail.compose`. These are restricted Gmail
scopes. A public SaaS deployment must complete Google's OAuth app verification,
publish a privacy policy, document data use, and complete the required
restricted-scope security assessment before broad external use. Local
development should use test users and throwaway mailboxes.

Gmail writes remain review-only. The worker can create or update a draft review
record, but sending mail requires an authenticated user action through
`POST /api/v1/gmail/draft-reviews/:reviewId/send`.

## Gmail Local Mock

For local demos without Google OAuth, set:

```bash
GMAIL_DEV_MOCK_ENABLED=true
GMAIL_TOKEN_ENCRYPTION_KEY=<random-secret>
```

The Integrations workspace will show a simulated Gmail connection action. Mock
mode creates deterministic thread and draft behavior for worker tools, while
send still goes through the review API. The mock is explicit and local-only; it
does not weaken the production OAuth requirements.

## GitHub App Registration

Create a GitHub App, not an OAuth App or personal access token. Configure the
callback URL:

```text
http://localhost:3000/github/oauth/callback
```

Production must use:

```text
https://<domain>/github/oauth/callback
```

Configure the webhook URL for local API testing through a tunnel:

```text
https://<tunnel-domain>/api/v1/github/webhook
```

Production uses:

```text
https://<api-domain>/api/v1/github/webhook
```

Set these variables in `.env`:

```bash
GITHUB_APP_ID=<app-id>
GITHUB_CLIENT_ID=<client-id>
GITHUB_CLIENT_SECRET=<client-secret>
GITHUB_PRIVATE_KEY=<pem-private-key>
GITHUB_WEBHOOK_SECRET=<random-webhook-secret>
GITHUB_REDIRECT_URI=http://localhost:3000/github/oauth/callback
GITHUB_TOKEN_ENCRYPTION_KEY=<random-secret>
GITHUB_TOOL_TIMEOUT_MS=15000
```

Grant the app these read permissions for v1:

```text
Metadata: read
Contents: read
Issues: read
Pull requests: read
```

Install the app on selected repositories. After OAuth completes, run
`POST /api/v1/github/installations/sync` from the Integrations workspace so the
API stores tenant-owned installation and repository metadata.

## GitHub Reads And Reviewed Writes

Repository reads are MCP-style worker tools:

```text
github.list_repositories
github.get_file
github.search_code
github.list_issues
github.list_pull_requests
github.get_pull_request
```

Each tool call is checked against `enabledToolIds`, tenant-owned synchronized
repositories, output size limits, and server-side token providers. Tool audit
previews are redacted for GitHub payloads to avoid copying repository content
into logs.

GitHub writes are not model-callable tools. The API supports review records
for issue comments, pull request comments, and issue creation:

```text
GET /api/v1/github/action-reviews
POST /api/v1/github/action-reviews
PATCH /api/v1/github/action-reviews/:id
POST /api/v1/github/action-reviews/:id/submit
POST /api/v1/github/action-reviews/:id/reject
```

Submit re-checks the authenticated user, active tenant, review ownership,
mutable review status, and current tenant-owned repository access before
calling GitHub. Audit rows store metadata such as kind, target number,
repository full name, status, and body length. They do not store draft body
content.

## Observability And Audit

Every OAuth callback response includes the request correlation ID. Send an
`x-correlation-id` header during manual tests to trace one browser action
through API logs:

```bash
curl -i \
  -H "Authorization: Bearer $DEVHUB_ACCESS_TOKEN" \
  -H "x-correlation-id: oauth-smoke-test" \
  -H "Content-Type: application/json" \
  -d '{"code":"bad","state":"bad"}' \
  http://localhost:4000/api/v1/github/oauth/callback
```

Expected failures include a stable `code`, a human message, empty or safe
details, and the same `correlationId`. Server logs include method, path,
status, duration, and correlation ID. Unhandled exceptions log stack traces on
the server only.

Audit rows should exist for connect, disconnect, installation sync, worker tool
calls, Gmail draft submit/reject, and GitHub action review submit/reject. Audit
metadata must not include OAuth tokens, provider secrets, Gmail message bodies,
GitHub draft bodies, raw repository file content, or raw external provider
payloads.

## Release Verification

Use the deterministic suite before relying on provider accounts:

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
```

Run integration tests when PostgreSQL, Redis, and Qdrant are available:

```bash
npm run test:integration
```

Run `npm run eval:golden` only with the API and worker stack running and
`DEVHUB_ACCESS_TOKEN` set. For real OAuth smoke tests, connect Gmail and GitHub
from the Integrations workspace, sync GitHub installations, run Gmail and
Repository Researcher agents, inspect the audit log, then reject or submit one
reviewed write.
