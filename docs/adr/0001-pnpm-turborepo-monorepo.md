# ADR 0001: pnpm and Turborepo Monorepo

Status: Accepted

Use one TypeScript repository with pnpm workspaces and Turborepo. Applications
remain separate runtime processes while contracts and framework-free logic are
shared. This keeps cross-service changes reviewable in one pull request without
collapsing deployment boundaries.
