# Contributing

## Pull Request Workflow

All changes after the initial repository baseline go through pull requests.
Create branches from the latest `main` using:

- `docs/<topic>` for documentation.
- `feat/<topic>` for product work.
- `fix/<topic>` for defects.
- `chore/<topic>` for tooling and maintenance.

Open each pull request as a draft. Keep it focused on one implementation stage,
use Conventional Commits, and prefer squash merge. The repository owner reviews
and merges manually.

## Pull Request Requirements

Describe the scope, motivation, user or developer impact, tests, risks, and any
visual changes. Confirm tenant isolation whenever persistence, retrieval,
authorization, queues, or real-time subscriptions are touched.

Do not mix unrelated refactors with feature work. Do not commit secrets,
generated runtime data, local uploads, or model files.

## Definition of Done

- Acceptance criteria for the stage are met.
- Relevant documentation and contracts are updated.
- Lint, typecheck, tests, and build pass when those checks exist.
- Failure paths and tenant isolation are covered where applicable.
- Logs and errors do not disclose credentials or sensitive content.
- The pull request contains no unresolved review conversation.
