# CI/CD Deploy Flow (memory mirror)

> Mirror of memory `cicd-deploy-flow`. Authoritative design lives in
> [`../operations/github-actions.md`](../operations/github-actions.md) and
> [`../operations/github-actions-enablement.md`](../operations/github-actions-enablement.md).
> Service deploy internals: [`deployment-modules.md`](deployment-modules.md).

This is the actionable runbook plus gotchas verified in practice.

**Branch flow (strict - `main` is protected, no direct human push):**
```
feature branch -> PR to develop -> ci (quality-gate) -> squash-merge to develop
  -> ci on develop -> controlled promotion develop->main (promote.yml, workflow_dispatch)
  -> ci on main -> docker-build (6 images, GHCR+ACR) -> deploy (auto SSH)
```
`develop` = integration branch; updating `main` == production release approved.
Always branch off `origin/develop`, never off a stale local branch.

**Promotion command** (only normal path to advance `main`; needs develop CI green first):
```bash
gh workflow run promote.yml -f target=main \
  -f expected_sha=<origin/develop SHA> \
  -f release_confirmed=true \
  -f release_note="<summary>"
```
promote.yml validates: target=main, release_confirmed=true, release_note non-empty,
expected_sha == origin/develop, main is ancestor of develop, and develop's
`quality-gate` check == success. Then fast-forwards main and pushes.

**Gotchas:**
- `PROMOTION_TOKEN` IS configured, so the fast-forward push to main triggers the
  downstream `ci -> docker-build -> deploy` chain (a `GITHUB_TOKEN` push
  would not).
- `docker-build` intermittently fails at "Set up Docker Buildx" (infra flake, not
  code). Fix: `gh run rerun <run-id> --failed`; the re-run's success re-fires deploy.
- promote.yml runs the workflow file from `main`, so workflow self-changes (e.g.
  action-version bumps) show their effect/warnings one promotion late.
- Squash merges mean `git branch -d` refuses merged branches as "not fully merged";
  use `-D` after confirming the PR is MERGED via `gh pr view`.
- CI has an ASCII-only contract check on source/docs - non-ASCII (em-dashes, smart
  quotes) fails `Static script checks`. Keep docs ASCII.
- Clash rule renders are guarded by `deploy/scripts/19-check-clash-rules.py`
  during deploy `verify`; a green deploy means the rendered config passed it.
- After deploy, `git branch -vv` shows merged remotes as `: gone` (prune with
  `git fetch --prune`); local `main` can drift behind/diverge - realign with
  `git reset --hard origin/main`.
