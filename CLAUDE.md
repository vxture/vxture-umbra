# Umbra Repository Standards

Authoritative working agreement for this repo. The goal is a clean, predictable
branch and deploy flow with no direct human writes to protected branches.

## Branch model

- `main` - production. Updating `main` == "release approved for production".
- `develop` - integration branch. All feature work merges here first.
- `claude-memory` - independent Claude memory versioning line. NOT part of the
  product pipeline; never merge it into `develop`/`main`.

Always branch off `origin/develop`, never off a stale local branch.

## How to make a change (the only path)

1. `git fetch origin && git switch -c <feature> origin/develop`
2. Commit work on the feature branch.
3. Open a PR into `develop`. Direct `git push origin develop` is BLOCKED by
   ruleset (must go through a PR, and the `quality-gate` check must pass).
4. CI `quality-gate` runs on the PR. Squash-merge once green; the branch is
   auto-deleted on merge.
5. Promote `develop` -> `main` via `promote.yml` (see below). Do not push `main`.

Squash merge only (merge commits and rebase merges are disabled) to keep a
linear history.

## Branch protection (GitHub Rulesets, not legacy protection)

Enforced via repo Rulesets (`gh api repos/vxture/umbra/rulesets`). Legacy
`branches/*/protection` returns 404 - do not look there.

- `develop` ("Umbra develop quality gate"): require PR (0 approvals), require
  `quality-gate` status check (strict / up-to-date with base), block deletion,
  block non-fast-forward, require linear history.
- `main` ("Umbra main release gate"): require `quality-gate` status check
  (strict), block deletion, block non-fast-forward, require linear history.
  Deliberately NO pull-request rule - `main` only advances via `promote.yml`'s
  fast-forward push. Adding a PR rule here (without a bypass actor for the
  promotion identity) would block promotion and break releases.

## Promotion (develop -> main)

The only normal way to advance `main`. Requires `develop` CI green first:

```
gh workflow run promote.yml -f target=main \
  -f expected_sha=<origin/develop SHA> \
  -f release_confirmed=true \
  -f release_note="<summary>"
```

`promote.yml` validates: target is `main`, `release_confirmed=true`,
`release_note` non-empty, `expected_sha == origin/develop`, `main` is an
ancestor of `develop`, and develop's `quality-gate` == success. Then it
fast-forwards `main` and pushes. `PROMOTION_TOKEN` is configured so this push
re-fires the downstream chain.

## CI/CD pipeline

```
feature -> PR to develop -> ci (quality-gate) -> squash-merge to develop
  -> ci on develop -> promote.yml (manual, fast-forward) -> main
  -> release on main: detect -> docker-build (6 images: GHCR + Aliyun ACR)
  -> deploy (auto SSH deploy + verify)
```

Workflows: `.github/workflows/{ci,promote,release}.yml`. `docker-build` and
`deploy` are jobs inside `release.yml` (gated by a `detect` job that
skips docs-only changes and builds only the images whose sources changed), not
standalone workflow files - the contract check forbids the retired
`docker-build.yml`/`deploy-worker-03.yml` filenames from reappearing. `ci.yml`
triggers on PRs to develop/main and pushes to develop; it does NOT run on
`main` (main only advances via `promote.yml`, which fires `release.yml`).
Design doc: `docs/operations/github-actions.md`. Deploy internals live under
`deploy/`.

`quality-gate` must pass before any merge or promotion. It runs:
- static script checks (`bash -n`, `python -m compileall`,
  `scripts/checks/06-check-deploy-contracts.py`, `git diff --check`)
- portal type-checks and production builds (website, console, admin)
- `docker compose --env-file .env.example config` validation

## Repository hygiene

- Keep the working tree clean; do not commit local runtime artifacts
  (`.env`, `.env.bak.*`, generated data, certs, caches) - they are git-ignored
  and skipped by contract scans on purpose.
- After a deploy/merge, prune stale remotes: `git fetch --prune`. Local `main`
  may drift; realign with `git reset --hard origin/main`.
- Squash merges make `git branch -d` report merged branches as "not fully
  merged"; use `-D` after confirming the PR is MERGED via `gh pr view`.

## Contract checks - do not break these

`scripts/checks/06-check-deploy-contracts.py` enforces deployment safety
invariants and an ASCII-only rule over source/doc paths
(`.github`, `configs`, `portals`, `docs`, `services`, `scripts`, `deploy`,
plus a few root files). In those paths use ASCII only - no em-dashes, smart
quotes, or non-ASCII characters, or `quality-gate` fails. Retired workflows
(`quality-gate.yml`, `promote-develop-to-main.yml`, `docker-build.yml`,
`deploy-worker-03.yml`) must not reappear.

## Operational gotchas

- `docker-build` intermittently fails at "Set up Docker Buildx" (infra flake,
  not code). Re-run with `gh run rerun <run-id> --failed`; success re-fires
  deploy.
- `promote.yml` runs the workflow file from `main`, so workflow self-changes
  take effect one promotion late.
