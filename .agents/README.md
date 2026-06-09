# Project Agents

This directory stores project-owned agent roles and the audited external skill
manifest. Third-party skill contents are installed locally into
`.agents/skills/` and are intentionally excluded from Git.

Run the setup script from the repository root:

```powershell
.\.agents\setup-skills.ps1
```

The script verifies the expected upstream commit for each source before calling
the `skills.sh` CLI. Review `.agents/skills-lock.json` for accepted limitations
and repository-specific overrides.

`AGENTS.md` remains the authoritative instruction file. External skills are
advisory and never override repository security or architecture decisions.
