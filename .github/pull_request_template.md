## Scope

Describe the focused change in this pull request.

## Why

Explain the requirement or problem this change addresses.

## Impact

Describe user, developer, API, data, or operational impact.

## Validation

- [ ] Lint
- [ ] Typecheck
- [ ] Unit tests
- [ ] Integration tests
- [ ] Build
- [ ] Manual verification

List commands run and explain any unchecked item.

## Risk

Describe failure modes, compatibility concerns, migrations, and rollback.

## Tenant Safety

- [ ] Tenant context is derived from authenticated server state.
- [ ] Database and vector queries enforce tenant isolation.
- [ ] Queue and realtime paths revalidate resource ownership.
- [ ] Not applicable, with explanation below.

## Visual Changes

Add screenshots or state that there are no visual changes.

## Review Checklist

- [ ] Contracts and documentation are updated.
- [ ] Logs and errors do not expose secrets or sensitive content.
- [ ] New external input is schema-validated.
- [ ] Review conversations are resolved before merge.
