# GitHub Actions CI/CD Design

This document defines the Umbra GitHub Actions deployment contract. It is based
on the Vxture CI/CD design in `D:\MyWebSite\vxture\docs\deployment\05-ci-cd.md`,
but scoped to this repository's current service model.

Umbra publishes deployable images to GitHub Container Registry and Aliyun ACR.
worker-03 deploys by pulling those images and restarting Docker Compose. It
must not build production images on the server during normal deployment.

Implementation checklist:

- [`plans/ci-cd-acr-rollout-checklist.md`](../../plans/ci-cd-acr-rollout-checklist.md)
- [`docs/operations/github-actions-enablement.md`](github-actions-enablement.md)

## Goals

1. Keep `develop` as the daily integration branch.
2. Keep `main` as the production-approved branch.
3. Run a repeatable quality gate before code can advance.
4. Make promotion auditable and fast-forward only.
5. Deploy worker-03 automatically only after `main` has passed CI.
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
  -> ci on main
  -> docker-build on main
  -> deploy-worker-03
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
| Push to `main` | yes | no | after CI success | after Docker build success |
| Tag push | no current behavior | no | optional future semver build | no |

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
| `.github/workflows/docker-build.yml` | `docker-build` | `docker-build` | Build and push production images |
| `.github/workflows/deploy-worker-03.yml` | `deploy-worker-03` | `deploy-worker-03` | Production deployment after image push |

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
      - main
```

CI responsibilities:

| Check | Command |
|---|---|
| Install website dependencies | `npm ci --prefix portals/website` |
| Install console dependencies | `npm ci --prefix portals/console` |
| Install admin dependencies | `npm ci --prefix portals/admin` |
| Diff whitespace | `git diff --check` |
| Shell syntax | `bash -n scripts/**/*.sh` equivalent |
| Python syntax | `python -m compileall -q scripts services` |
| Deploy contract checks | `python scripts/deploy/08-check-script-contracts.py` |
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

- Preferred: dedicated `PROMOTION_TOKEN` with permission to update protected
  branches according to the repository ruleset.
- Avoid relying on `GITHUB_TOKEN` if branch protection blocks it.

Audit output:

- Print source branch, target branch, old target SHA, promoted SHA, actor, and
  release note.
- If a promotion PR convention is adopted later, the workflow should comment on
  that PR after successful promotion.

## Docker Build Workflow

`docker-build.yml` runs after `ci` succeeds on a `main` push. It builds the six
Umbra-owned runtime images and pushes each image to both GHCR and Aliyun ACR.

Trigger:

```yaml
on:
  workflow_run:
    workflows:
      - ci
    types:
      - completed
    branches:
      - main
```

Required job condition:

```yaml
if: >-
  ${{
    github.event.workflow_run.conclusion == 'success' &&
    github.event.workflow_run.head_branch == 'main'
  }}
```

Do not check `github.event.workflow_run.event == 'push'` here. This deploy
workflow listens to the `docker-build` workflow, whose event is `workflow_run`;
the original push has already been validated by `docker-build`.

The build must use the exact SHA that passed CI:

```bash
PASSED_SHA="${{ github.event.workflow_run.head_sha }}"
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
For worker-03 production deploys, `image:` should resolve to ACR first.

Example shape:

```yaml
services:
  umbra-website:
    image: ${IMAGE_REGISTRY}/${IMAGE_NAMESPACE}/ruyin-website:${IMAGE_TAG:-latest}
  umbra-account-web:
    image: ${IMAGE_REGISTRY}/${IMAGE_NAMESPACE}/ruyin-console:${IMAGE_TAG:-latest}
```

`IMAGE_REGISTRY` should point to Aliyun ACR on worker-03. A GHCR fallback can be
kept as an explicit rollback operation, but normal production deploys should
use ACR.

## Deploy Workflow

`deploy-worker-03.yml` runs only after `docker-build` completes successfully on
a `main` push. It does not build images.

Trigger:

```yaml
on:
  workflow_run:
    workflows:
      - docker-build
    types:
      - completed
    branches:
      - main
```

Required job condition:

```yaml
if: >-
  ${{
    github.event.workflow_run.conclusion == 'success' &&
    github.event.workflow_run.event == 'push' &&
    github.event.workflow_run.head_branch == 'main'
  }}
```

Deployment must use the exact SHA that was built and pushed:

```bash
PASSED_SHA="${{ github.event.workflow_run.head_sha }}"
```

Remote command contract:

```bash
cd "$REPO_DIR"
git fetch origin main
git checkout main
git merge --ff-only "$PASSED_SHA"
test "$(git rev-parse HEAD)" = "$PASSED_SHA"

export IMAGE_REGISTRY="$ALIYUN_ACR_REGISTRY"
export IMAGE_NAMESPACE="${ALIYUN_ACR_NAMESPACE:-vxture}"
export IMAGE_TAG="sha-<short-sha>"

bash scripts/deploy.sh all
bash scripts/deploy.sh verify
```

Notes:

- The deploy user must be non-root. `deploy.sh all` intentionally rejects root.
- The remote repo must not have local commits that prevent fast-forward.
- Runtime state remains on worker-03 under `.env`, `DATA_DIR`, and
  `BACKUP_DIR`; CI must not carry production secrets except SSH credentials.
- Config rendering and certificate lifecycle still belong to Umbra deploy
  scripts. `scripts/deploy.sh all` reaches `scripts/deploy.sh start`, which
  pulls `IMAGE_TAG` and runs `docker compose up -d`.

## Required Secrets

CI:

| Secret | Purpose |
|---|---|
| `NODE_AUTH_TOKEN` | GitHub Packages read token for `@vxture/*` packages |

Promotion:

| Secret | Purpose |
|---|---|
| `PROMOTION_TOKEN` | Optional dedicated token for protected branch promotion |

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
- [x] Add `docker-build.yml` for the six ACR/GHCR images.
- [x] Add dedicated Dockerfiles for `ruyin-nginx`, `ruyin-account-api`, and
      `ruyin-subproxy`.
- [x] Ensure `docker-compose.yml` uses the six ACR repository names in `image:`
      fields.
- [x] Ensure `deploy-worker-03.yml` listens to workflow `docker-build`, not
      `ci`.
- [ ] Add the required GitHub secrets.
- [ ] Configure repository rulesets for `develop` and `main`.
- [ ] Run one dry promotion against a disposable branch or test repository if
      ruleset permissions are uncertain.

## Non-Goals

- No beta branch in this phase.
- No automatic develop-to-main promotion without release confirmation.
- No production approval after `main` has already advanced.
- No tag-based semver release images until a release workflow is designed.
