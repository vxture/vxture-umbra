# GitHub Actions CI/CD Design

This document defines the Umbra GitHub Actions deployment contract. It is based
on the Vxture CI/CD design in `D:\MyWebSite\vxture\docs\deployment\05-ci-cd.md`,
but scoped to this repository's current service model.

Umbra publishes deployable images to GitHub Container Registry and Aliyun ACR.
worker-03 deploys by pulling those images and restarting Docker Compose. It
must not build production images on the server during normal deployment.

Enablement checklist:

- [`docs/operations/github-actions-enablement.md`](github-actions-enablement.md)

## Goals

1. Keep `develop` as the daily integration branch.
2. Keep `main` as the production-approved branch.
3. Run a repeatable quality gate before code can advance.
4. Make promotion auditable and fast-forward only.
5. Deploy worker-03 automatically only after images are built for the promoted,
   CI-validated revision.
6. Build and push immutable images before worker-03 deploys.
7. Push each image to both GHCR and Aliyun ACR.
8. Keep production approval before `main`, not inside the deploy job.

## Branch Flow

Target flow:

```text
feature/fix branch
  -> pull request to develop
  -> ci
  -> merge to develop
  -> ci on develop
  -> controlled promotion develop -> main
  -> release on main push (detect -> build -> deploy jobs)
```

Production meaning:

```text
main updated == release approved for production
```

Do not add an approval gate after `main` is updated. If production approval is
needed, it belongs in the promotion step before `main` advances.

## Trigger Matrix

| Event | CI | Promotion | Docker build/push | worker-03 deploy |
|---|---:|---:|---:|---:|
| Pull request to `develop` | yes | no | no | no |
| Pull request to `main` | yes | no | no | no |
| Push to `develop` | yes | no automatic promotion | no | no |
| Manual promotion `develop -> main` | validates and pushes | yes | no | no |
| Push to `main` | no (already validated) | no | `release` build job | `release` deploy job |
| Tag push | no current behavior | no | optional future semver build | no |

CI does not run again on `main`. Promotion only fast-forwards `main` to a
`develop` revision whose `quality-gate` already passed (promote.yml verifies it,
and the `main` ruleset requires that same check on the SHA), so re-running CI on
`main` would re-test byte-identical content. The `release` workflow therefore
triggers directly on the `main` push and runs detect -> build -> deploy as
sequential jobs (no `workflow_run` hops, one change-detection pass).

Important constraint:

```text
develop CI success must not automatically push main.
```

Promotion must be a controlled entry point with explicit inputs and audit
metadata.

## Workflow Inventory

Target workflow files:

| File | Workflow name | Job/check name | Purpose |
|---|---|---|---|
| `.github/workflows/ci.yml` | `ci` | `quality-gate` | Static checks and portal builds |
| `.github/workflows/promote.yml` | `branch-promotion` | `fast-forward-promotion` | Manual controlled promotion |
| `.github/workflows/release.yml` | `release` | `detect` / `docker-build` / `deploy-worker-03` | Build and push images, then deploy worker-03 |

Naming policy:

- New machine-referenced names use `kebab-case`.
- Required check names should be treated as stable contracts.
- Do not rename workflow names or job names casually after branch protection is
  configured.

## CI Workflow

`ci.yml` should run on:

```yaml
on:
  pull_request:
    branches:
      - develop
      - main
  push:
    branches:
      - develop
```

CI does not run on `push` to `main`: `main` only advances by fast-forward
promotion to an already-validated `develop` SHA, so a `main` CI run would be
redundant. `docker-build` triggers on the `main` push instead.

CI responsibilities:

| Check | Command |
|---|---|
| Install website dependencies | `npm ci --prefix portals/website` |
| Install console dependencies | `npm ci --prefix portals/console` |
| Install admin dependencies | `npm ci --prefix portals/admin` |
| Diff whitespace | `git diff --check` |
| Shell syntax | `bash -n scripts/**/*.sh` equivalent |
| Python syntax | `python -m compileall -q scripts services` |
| Deploy contract checks | `python scripts/checks/06-check-deploy-contracts.py` |
| Website type check | `npm run type-check --prefix portals/website` |
| Console type check | `npm run type-check --prefix portals/console` |
| Website build | `npm run build --prefix portals/website` |
| Console build | `npm run build --prefix portals/console` |
| Admin build | `npm run build --prefix portals/admin` |
| Compose validation | `docker compose --env-file .env.example config --quiet` |

CI requires `NODE_AUTH_TOKEN` because website and console consume private
`@vxture/*` packages from GitHub Packages.

Concurrency:

```yaml
concurrency:
  group: ci-${{ github.event_name == 'pull_request' && github.event.pull_request.number || github.ref }}
  cancel-in-progress: true
```

The exact expression can differ, but the behavior must be:

- New commits to the same PR cancel older CI runs.
- New pushes to the same protected branch cancel older CI runs.

## Promotion Workflow

`promote.yml` is the only normal path for advancing `main`.

Trigger:

```yaml
on:
  workflow_dispatch:
```

Inputs:

| Input | Required | Example | Purpose |
|---|---:|---|---|
| `target` | yes | `main` | Promotion target branch |
| `expected_sha` | yes | `abc123...` | Expected source SHA from `origin/develop` |
| `release_confirmed` | yes for `main` | `true` | Confirms production release approval |
| `release_note` | yes for `main` | `Ruyin portal update` | Audit note for production release |

Current Umbra scope only needs `develop -> main`. If `beta` is introduced later,
extend this workflow instead of creating an unrelated release path.

Required validations before push:

1. `target` must be `main`.
2. `release_confirmed` must be `true`.
3. `release_note` must be non-empty.
4. `expected_sha` must equal `origin/develop`.
5. `origin/main` must be an ancestor of `origin/develop`.
6. Required CI checks for `expected_sha` must be successful.
7. Promotion must use fast-forward only.
8. Promotion must never force-push.

Promotion action:

```bash
git fetch origin main develop
test "$(git rev-parse origin/develop)" = "$expected_sha"
git merge-base --is-ancestor origin/main origin/develop
git checkout main
git reset --hard origin/main
git merge --ff-only origin/develop
git push origin HEAD:main
```

Authentication:

- Required: dedicated `PROMOTION_TOKEN` with permission to update protected
  branches according to the repository ruleset.
- Do not rely on `GITHUB_TOKEN` for promotion. Pushes made with `GITHUB_TOKEN`
  do not trigger the downstream `ci -> docker-build -> deploy-worker-03` chain.

Audit output:

- Print source branch, target branch, old target SHA, promoted SHA, actor, and
  release note.
- If a promotion PR convention is adopted later, the workflow should comment on
  that PR after successful promotion.

## Release Workflow

`release.yml` runs on `push` to `main` and contains the whole post-promotion
pipeline as three sequential jobs: `detect` (change detection, runs once),
`docker-build` (build/retag the six images), and `deploy-worker-03` (SSH deploy).
`main` is only reachable by fast-forward promotion of an already-validated
`develop` SHA, so the push is trusted and no separate `main` CI run precedes it.

Trigger:

```yaml
on:
  push:
    branches:
      - main
```

Change detection (`detect` job):

`detect` runs once and compares the pushed SHA against the base - the SHA of the
last successful `release.yml` run on `main`. It emits two outputs that gate the
rest of the pipeline:

- `deployable` - false when every changed file is documentation or repo-side
  metadata, true otherwise. Non-deployable paths: `docs/*`, `.claude/*`,
  `.github/*`, `scripts/*`, and root `CLAUDE.md` / `README.md` / `LICENSE`.
  worker-03 deploys from `deploy/worker-03/`, never from `scripts/` (repo-side
  quality-gate checks and GitHub helpers) or `.github/*` (CI plumbing), so a
  change confined to those ships nothing to the runtime images. When
  `deployable=false`, both `docker-build` and `deploy-worker-03` are skipped.
- `build_images` - the subset of images whose source changed, mapped per path
  (`portals/website/*` -> `ruyin-website`, `brand/*` -> the three portals,
  `services/account/*` or its Dockerfile -> `ruyin-account-api`, and so on). An
  unknown non-doc path forces a full rebuild (over-building is safe; shipping
  stale code is not). With no known base (the first release), detect defaults to
  deployable with a full rebuild.

Three outcomes follow:

| Change scope | deployable | build_images | Effect |
|---|---|---|---|
| docs / scripts / `.github` only | false | n/a | `docker-build` and `deploy-worker-03` skipped |
| `configs/*` or `deploy/*` only | true | `[]` | every image retags `:latest` to the per-commit tag (digest preserved, no rebuild); deploy re-renders config |
| portal / service / brand source | true | changed set | rebuild the changed images, retag the rest, then deploy |

The retag path (`docker buildx imagetools create`) keeps the running container's
image digest stable, so a config-only release re-renders templates and reloads
nginx without a pointless container recreate.

The `docker-build` job (and the `deploy-worker-03` job) use the pushed SHA:

```bash
PASSED_SHA="${{ github.sha }}"
```

Image tags for `main`:

```text
latest
sha-<short-sha>
```

Registry targets:

| Target container | ACR repository in namespace `vxture` | GHCR repository | Source |
|---|---|---|---|
| `umbra-website` | `ruyin-website` | `ghcr.io/vxture/ruyin-website` | `portals/website/Dockerfile` |
| `umbra-account-web` | `ruyin-console` | `ghcr.io/vxture/ruyin-console` | `portals/console/Dockerfile` |
| `umbra-admin` | `ruyin-admin` | `ghcr.io/vxture/ruyin-admin` | `portals/admin/Dockerfile` |
| `umbra-nginx` | `ruyin-nginx` | `ghcr.io/vxture/ruyin-nginx` | dedicated Dockerfile required |
| `umbra-account` | `ruyin-account-api` | `ghcr.io/vxture/ruyin-account-api` | dedicated Dockerfile required |
| `umbra-subproxy` | `ruyin-subproxy` | `ghcr.io/vxture/ruyin-subproxy` | dedicated Dockerfile required |

The first three images use the portal Dockerfiles. `umbra-admin` is the target
container name for the `portals/admin` Next.js app. The last three images use
dedicated Dockerfiles so production does not rely on `nginx:alpine` or
`python:3.12-alpine` plus bind-mounted source.

Build matrix fields:

| Field | Meaning |
|---|---|
| `name` | Logical image name, for example `ruyin-website` |
| `context` | Docker build context |
| `dockerfile` | Dockerfile path |
| `container` | Runtime container name |
| `acr_repository` | ACR repository name |

Push rules:

1. Build each image once per matrix entry.
2. Tag the result with both GHCR and ACR names.
3. Push both registries in the same workflow run.
4. If GHCR push fails, the workflow fails.
5. If ACR push fails, the workflow fails; worker-03 should not deploy.
6. Docker build must receive `NODE_AUTH_TOKEN` for private `@vxture/*` packages.

Required ACR secrets:

| Secret | Purpose |
|---|---|
| `ALIYUN_ACR_REGISTRY` | ACR registry host |
| `ALIYUN_ACR_NAMESPACE` | ACR namespace, currently `vxture` |
| `ALIYUN_ACR_USERNAME` | ACR login username |
| `ALIYUN_ACR_PASSWORD` | ACR login password or token |

Optional:

| Secret | Purpose |
|---|---|
| `ALIYUN_ACR_INTERNAL_HOST` | Internal pull host for worker-03 if available |

Compose contract:

`docker-compose.yml` must use the same repository names in `image:` fields.
For worker-03 production deploys, `image:` should resolve to GHCR first and
Aliyun ACR second.

Example shape:

```yaml
services:
  umbra-website:
    image: ${IMAGE_REGISTRY}/${IMAGE_NAMESPACE}/ruyin-website:${IMAGE_TAG:-latest}
  umbra-account-web:
    image: ${IMAGE_REGISTRY}/${IMAGE_NAMESPACE}/ruyin-console:${IMAGE_TAG:-latest}
```

`IMAGE_REGISTRY` should point to GHCR on worker-03. The deploy script may fall
back to Aliyun ACR after GHCR pull retries are exhausted. worker-03 is a Vultr
Tokyo server, so GHCR is the primary runtime pull source and the Hangzhou ACR
mirror is retained as a backup for the same immutable image tags.

## Deploy Job

The `deploy-worker-03` job runs inside `release.yml` after the `build` job
completes successfully. It does not build images.

Job dependency and condition:

```yaml
needs: [detect, build]
if: ${{ needs.detect.outputs.deployable == 'true' }}
environment:
  name: worker-03
```

The deploy job depends on `build`, so a failed build skips the deploy; and it
shares the single `detect` output (no second change-detection pass). It deploys
only when there is a deployable change.

Deployment must use the exact SHA that was built and pushed:

```bash
PASSED_SHA="${{ github.sha }}"
```

Remote command contract:

```bash
cd "$REPO_DIR"
git fetch origin main
git checkout main
git merge --ff-only "$PASSED_SHA"
test "$(git rev-parse HEAD)" = "$PASSED_SHA"

export IMAGE_REGISTRY="$GHCR_REGISTRY"
export IMAGE_NAMESPACE="$GHCR_NAMESPACE"
export IMAGE_TAG="sha-<short-sha>"
export FALLBACK_IMAGE_REGISTRY="$ALIYUN_ACR_REGISTRY"
export FALLBACK_IMAGE_NAMESPACE="${ALIYUN_ACR_NAMESPACE:-vxture}"

bash deploy/worker-03/deploy.sh all
bash deploy/worker-03/deploy.sh verify
```

Notes:

- The deploy user must be non-root. `deploy.sh all` intentionally rejects root.
- The remote repo must not have local commits that prevent fast-forward.
- ACR login uses retry/backoff because first contact to the remote registry can
  intermittently hit TLS handshake timeouts.
- Image pull uses GHCR first. If GHCR image pulls fail after retries, deployment
  may switch to Aliyun ACR (`registry.cn-hangzhou.aliyuncs.com/vxture`) for the
  same immutable `sha-<short-sha>` tag.
- Runtime state remains on worker-03 under `.env`, `DATA_DIR`, and
  `BACKUP_DIR`; CI must not carry production secrets except SSH credentials.
- Config rendering and certificate lifecycle still belong to Umbra deploy
  scripts. `deploy/worker-03/deploy.sh all` reaches `deploy/worker-03/deploy.sh start`, which
  pulls `IMAGE_TAG` and runs `docker compose up -d`.

## Required Secrets

CI:

| Secret | Purpose |
|---|---|
| `NODE_AUTH_TOKEN` | GitHub Packages read token for `@vxture/*` packages |

Promotion:

| Secret | Purpose |
|---|---|
| `PROMOTION_TOKEN` | Dedicated token for protected branch promotion and downstream workflow triggering |

Docker build:

| Secret | Purpose |
|---|---|
| `GITHUB_TOKEN` | GHCR push token provided by GitHub Actions |
| `NODE_AUTH_TOKEN` | Build-time package token for private `@vxture/*` packages |
| `ALIYUN_ACR_REGISTRY` | ACR registry host |
| `ALIYUN_ACR_NAMESPACE` | ACR namespace, currently `vxture` |
| `ALIYUN_ACR_USERNAME` | ACR login username |
| `ALIYUN_ACR_PASSWORD` | ACR login password or token |

Deployment:

| Secret | Purpose |
|---|---|
| `WORKER_03_HOST` | Hostname or IP for worker-03 |
| `WORKER_03_USER` | Non-root deploy user, normally `stone` |
| `WORKER_03_SSH_KEY` | Private SSH key for the deploy user |
| `WORKER_03_PORT` | Optional SSH port, defaults to `22` |
| `WORKER_03_REPO_DIR` | Optional repo path, defaults to `/srv/vxture/repo/umbra` |
| `WORKER_03_KNOWN_HOSTS` | Optional pinned known_hosts line |
| `ALIYUN_ACR_REGISTRY` | ACR registry host used for image pulls |
| `ALIYUN_ACR_NAMESPACE` | ACR namespace, currently `vxture` |
| `ALIYUN_ACR_USERNAME` | Optional if worker-03 needs `docker login` |
| `ALIYUN_ACR_PASSWORD` | Optional if worker-03 needs `docker login` |

`WORKER_03_KNOWN_HOSTS` is recommended. Falling back to `ssh-keyscan` is easier
to bootstrap but weaker than pinning the host key.

## Repository Rulesets

Recommended rules:

| Branch | Rule |
|---|---|
| `develop` | Require PR or controlled maintainer merge; require `quality-gate` |
| `main` | Block direct human push; require promotion actor; require linear history |

If `PROMOTION_TOKEN` is used, repository rulesets must allow that actor to push
fast-forward updates to `main`.

Do not temporarily disable rulesets as a release path. If promotion is blocked,
fix the promotion workflow or ruleset configuration first.

## Current Implementation Checklist

Before enabling the workflows:

- [x] Rename or replace the initial `quality-gate.yml` with `ci.yml`.
- [x] Replace automatic `promote-develop-to-main.yml` with controlled
      `promote.yml`.
- [x] Add `release.yml` (detect -> build -> deploy) for the six ACR/GHCR images
      and the worker-03 deploy.
- [x] Add dedicated Dockerfiles for `ruyin-nginx`, `ruyin-account-api`, and
      `ruyin-subproxy`.
- [x] Ensure `docker-compose.yml` uses the six ACR repository names in `image:`
      fields.
- [x] Ensure the `release` `deploy-worker-03` job runs after the `build` job.
- [ ] Add the required GitHub secrets.
- [ ] Configure repository rulesets for `develop` and `main`.
- [ ] Run one dry promotion against a disposable branch or test repository if
      ruleset permissions are uncertain.

## Non-Goals

- No beta branch in this phase.
- No automatic develop-to-main promotion without release confirmation.
- No production approval after `main` has already advanced.
- No tag-based semver release images until a release workflow is designed.
