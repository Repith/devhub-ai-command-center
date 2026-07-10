# Local Development

## Runtime Layout

Local development uses a hybrid layout:

| Process | Location | Reason |
| --- | --- | --- |
| Next.js web | Host | Fast Refresh and browser access on port 3000 |
| NestJS API | Host | Fast TypeScript reload on port 4000 |
| Worker | Host | Fast reload and direct access to local tools |
| PostgreSQL | Docker Compose | Persistent, reproducible database |
| Redis | Docker Compose | Persistent BullMQ and Pub/Sub dependency |
| Qdrant | Docker Compose | Persistent vector storage |
| Ollama | Host | Direct local GPU access |

The application containers are intentionally not part of the current
local-development path. Version 0.1.0 is local-only, and running TypeScript
applications on the host keeps the development feedback loop simple. A future
deployment stage may add production Dockerfiles without changing the ports or
service boundaries documented here.

## First-Time Setup

Requirements:

- Node.js 22 or newer.
- npm 11.16.0.
- Docker Desktop or another running Docker Engine with Compose.

Run:

```bash
npm install
npm run setup
npm run dev
```

`npm run setup` performs three idempotent operations:

1. Creates `.env` from `.env.example` with a generated JWT secret when the file
   does not exist.
2. Starts PostgreSQL, Redis, and Qdrant and waits for their health checks.
3. Applies Prisma migrations and seeds development data.

`npm run dev` refuses to start when `.env` is missing or the JWT secret is too
short. It loads the root environment before Turborepo starts each application.
Relative `DOCUMENT_STORAGE_DIR` values are resolved from the repository root so
the API and worker share the same uploaded source files.

Install Ollama separately and pull the configured chat model before using the
chat endpoint:

```bash
ollama pull qwen3:8b
```

`OLLAMA_BASE_URL` defaults to `http://localhost:11434/v1`,
`OLLAMA_CHAT_MODEL` defaults to `qwen3:8b`, and `OLLAMA_API_KEY` defaults to
the ignored compatibility value `ollama`.

## Daily Commands

```bash
npm run infra:up
npm run infra:status
npm run dev
```

Stop infrastructure without deleting its named volumes:

```bash
npm run infra:down
```

Follow infrastructure logs:

```bash
npm run infra:logs
```

Reapply migrations and seed data:

```bash
npm run db:setup
```

Run the deterministic release flow checks without starting the full stack:

```bash
npm run test:e2e
```

This command validates shared contracts for the documented command-center demo.
It does not connect to PostgreSQL, Redis, Qdrant, Ollama, or Gmail.

## Usage Summary Limits

The local MVP usage dashboard keeps aggregation in application memory so the
runtime path stays easy to inspect. `PrismaUsageRepository` reads token usage in
1000-record cursor windows and caps a single summary at the most recent 5000
records for the requested period. Larger tenants should move the same grouping
to database-level aggregation before this becomes a production reporting
surface.

## Gmail OAuth and Mock Mode

Gmail is optional for local development. Real OAuth requires
`GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REDIRECT_URI`, and
`GMAIL_TOKEN_ENCRYPTION_KEY`. The default redirect URI is
`http://localhost:3000/gmail/oauth/callback`; configure the same value in the
Google Cloud OAuth client.

For a repeatable local demo without a Google account, set
`GMAIL_DEV_MOCK_ENABLED=true` and provide `GMAIL_TOKEN_ENCRYPTION_KEY`. The
Gmail workspace will offer a simulated connection, and worker-side Gmail tools
will use deterministic mock threads and drafts. Sending still goes through the
authenticated draft-review API path and never becomes a model-callable tool.

`apps/mcp-gmail` is a standalone diagnostic server only. The production and
normal local application path uses the API/worker server-side token provider,
not `GMAIL_ACCESS_TOKEN`. To run the diagnostic server manually, set
`GMAIL_MCP_DIAGNOSTIC_MODE=true` and provide a short-lived
`GMAIL_ACCESS_TOKEN`; do not use that mode for the application runtime.

## Integration Status and GitHub App Config

`GET /api/v1/integrations` returns tenant/user-scoped setup status for Gmail
and GitHub in one response. The endpoint exposes provider names, setup state,
account labels, scopes, timestamps, and missing environment key names only. It
never returns OAuth tokens, private keys, webhook secrets, or decrypted values.

GitHub App support starts with shared configuration and status reporting. A
real GitHub App integration will require `GITHUB_APP_ID`, `GITHUB_CLIENT_ID`,
`GITHUB_CLIENT_SECRET`, `GITHUB_PRIVATE_KEY`, `GITHUB_WEBHOOK_SECRET`,
`GITHUB_REDIRECT_URI`, and `GITHUB_TOKEN_ENCRYPTION_KEY`. GitHub read tools use
`GITHUB_TOOL_TIMEOUT_MS`, which defaults to 15000 milliseconds. For local
planning, the default callback value is
`http://localhost:3000/github/oauth/callback`; configure the matching callback
in the GitHub App before enabling the connect flow. The webhook receiver is
`http://localhost:4000/api/v1/github/webhook` in local API development; expose
it through a tunnel only when testing real GitHub installation events.

Detailed provider setup, verification notes, webhook configuration, reviewed
write behavior, and release smoke tests live in
[`docs/oauth-integrations.md`](./oauth-integrations.md).

## Connections

Default local endpoints:

| Service | Endpoint |
| --- | --- |
| Web | `http://localhost:3000` |
| API | `http://localhost:4000/api/v1` |
| PostgreSQL | `localhost:5432` |
| Redis | `localhost:6379` |
| Qdrant HTTP | `http://localhost:6333` |
| Qdrant gRPC | `localhost:6334` |

The browser calls `/api/v1` on the Next.js origin. Next.js proxies those
requests to `API_ORIGIN`, which defaults to `http://localhost:4000`. A proxy
`ECONNREFUSED` means the API process did not start; inspect the API error above
that message first.

## Troubleshooting

### JWT Secret Error

The root `.env` is missing or contains an old placeholder:

```bash
npm run env:init
```

The command never overwrites an existing `.env`. To regenerate the file, remove
the local `.env` intentionally and run the command again, or replace
`JWT_SECRET` with at least 32 random characters.

### Database Connection Error

Confirm Docker Engine is running, then:

```bash
npm run infra:status
npm run infra:up
npm run db:setup
```

Prisma reads the same root `.env` as the applications. Custom database
credentials or ports therefore apply consistently to Compose, migrations,
seeding, and the API.

### Document Ingestion Cannot Find Uploaded File

If the worker logs `ENOENT` for a path under `apps/worker/data/uploads`, restart
development with `npm run dev` so the shared upload directory is resolved from
the repository root. Documents uploaded before this fix may have been stored
under an application workspace directory; delete and upload those documents
again, or move the source file into the root `data/uploads` path shown in the
document storage key.

### Resetting Local Data

`npm run infra:down` preserves data. Removing named volumes destroys the local
PostgreSQL, Redis, and Qdrant state and must be performed manually and
intentionally.
