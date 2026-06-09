$ErrorActionPreference = "Stop"

$npx = "C:\Program Files\nodejs\npx.cmd"

if (-not (Test-Path $npx)) {
    throw "Node.js npx.cmd was not found at $npx."
}

$sources = @(
    @{
        Repository = "https://github.com/vercel-labs/next-skills.git"
        Ref = "dc1de9caf7612d73f56a8dec3cb1bd6c9ec096b9"
        Package = "https://github.com/vercel-labs/next-skills/tree/dc1de9caf7612d73f56a8dec3cb1bd6c9ec096b9"
        Skills = @("next-best-practices")
    },
    @{
        Repository = "https://github.com/vercel-labs/agent-skills.git"
        Ref = "4ec6f84b61cd3c931046c3e6e398f3ae7de372f7"
        Package = "https://github.com/vercel-labs/agent-skills/tree/4ec6f84b61cd3c931046c3e6e398f3ae7de372f7"
        Skills = @(
            "vercel-react-best-practices",
            "web-design-guidelines",
            "vercel-composition-patterns"
        )
    },
    @{
        Repository = "https://github.com/Mindrally/skills.git"
        Ref = "47f47c12e62f62b5e171bd5af61d0fc24b329701"
        Package = "https://github.com/Mindrally/skills"
        Skills = @(
            "prisma",
            "api-development",
            "postgresql-best-practices",
            "redis-best-practices",
            "websocket-development",
            "observability-guidelines",
            "technical-writing"
        )
    }
)

foreach ($source in $sources) {
    $remoteRef = git ls-remote $source.Repository refs/heads/main

    if (-not $remoteRef) {
        throw "Could not resolve main for $($source.Repository)."
    }

    $remoteSha = ($remoteRef -split "\s+")[0]

    if ($source.Package -notmatch "/tree/" -and $remoteSha -ne $source.Ref) {
        throw "Upstream changed for $($source.Repository). Audit the new commit before installing."
    }

    & $npx skills add $source.Package `
        --skill $source.Skills `
        --agent codex `
        --copy `
        --yes

    if ($LASTEXITCODE -ne 0) {
        throw "Skill installation failed for $($source.Repository)."
    }
}

& $npx skills list --json
