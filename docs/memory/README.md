# Memory Mirror

> Mirror of the Claude Code persistent memory store at
> `~/.claude/projects/D--MyWebSite-vxturestudio-umbra/memory/`.
> These files are durable project context loaded by AI assistants across
> sessions. They are summaries and pointers - the authoritative detail always
> lives in the linked `specs/`, `design/`, `implementation/`, and `operations/`
> docs. When memory and an authoritative doc disagree, the authoritative doc
> wins and the memory should be updated.

## Index

| File | Type | Summary |
|------|------|---------|
| [`project-overview.md`](project-overview.md) | project | Stack, domain layout, architecture, Marzban HTTP-proxy decision |
| [`deployment-modules.md`](deployment-modules.md) | project | `deploy.sh` dispatcher, step scripts, config update workflow |
| [`cicd-deploy-flow.md`](cicd-deploy-flow.md) | project | Git flow to production, promotion command, deploy gotchas |
| [`memory-versioning-preference.md`](memory-versioning-preference.md) | feedback | Version memory inside `vxture/umbra` on the `claude-memory` branch |

## Sync model

The live store under `~/.claude/.../memory/` is also a git repo whose `origin`
is `vxture/umbra`, pushed to the dedicated `claude-memory` branch. This `docs/memory/`
tree is the human-readable mirror that travels with the codebase on `develop`/`main`.
See [`memory-versioning-preference.md`](memory-versioning-preference.md).
