# DevHub AI Command Center

DevHub AI Command Center is an educational, local-first platform for learning
how production-oriented AI agent systems are designed. It combines agent
configuration, MCP tools, RAG, multi-tenant data isolation, background jobs,
real-time run timelines, usage tracking, and quality evaluation in one compact
system.

> Status: `v0.1.0` portfolio MVP is feature-complete for local review:
> authentication, tenant isolation, agent configuration, chat, document
> ingestion, embeddings, Qdrant retrieval, MCP tools, durable runs, live
> timelines, usage budgets, golden-set evaluation, rate limits, structured
> request logs, and audit views are implemented.

## Target Demo

1. Register and create a workspace.
2. Configure an agent backed by a local Ollama model.
3. Upload a Markdown, text, or PDF document.
4. Observe asynchronous parsing, chunking, embedding, and Qdrant indexing.
5. Ask a question and receive a grounded answer with citations.
6. Let the agent call an allowlisted MCP tool.
7. Inspect the live run timeline, token usage, latency, and failures.
8. Run a golden-set evaluation and compare the result.

## Architecture

The planned monorepo contains a Next.js dashboard, NestJS API, BullMQ worker,
two MCP servers, and shared TypeScript packages. PostgreSQL remains the source
of truth, Qdrant performs semantic retrieval, Redis supports BullMQ and
cross-process events, and Ollama provides local chat and embedding models.

Read the [architecture](docs/architecture.md), [product requirements](docs/product-requirements.md),
[implementation plan](docs/implementation-plan.md), and [portfolio release notes](docs/portfolio-release.md)
before contributing.

## Local Development

Install dependencies, initialize the local environment and Docker
infrastructure, then run the host applications with hot reload:

```bash
npm install
npm run setup
npm run dev
```

Ollama runs on the host to use the local GPU. No cloud model or API key is
required for the MVP. PostgreSQL, Redis, and Qdrant run in Docker Compose;
Next.js, NestJS, and the worker run on the host.

See [local development](docs/local-development.md) for service ports, daily
commands, environment handling, and troubleshooting.

## Portfolio Demo

Use [docs/demo-script.md](docs/demo-script.md) to run the same local demo from a
clean checkout. The script covers workspace registration, agent configuration,
document upload, indexing, RAG search, MCP use, live timeline recovery, usage
budgets, audit-log review, and golden-set evaluation.

## Delivery Model

Every logical stage is developed on a short-lived branch and opened as a draft
pull request. The repository owner reviews and merges each stage manually.
See [CONTRIBUTING.md](CONTRIBUTING.md) for branch, commit, test, and review
rules.

## License

[MIT](LICENSE)
