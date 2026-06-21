# GitHub Actions CI/CD Design

This document defines the Umbra GitHub Actions deployment contract. It is based
on the Vxture CI/CD design in `D:\MyWebSite\vxture\docs\deployment\05-ci-cd.md`,
but scoped to this repository's current service model.

Umbra publishes deployable images to GitHub Container Registry and Aliyun ACR.
production deploys by pulling those images and restarting Docker Compose. It
must not build production images on the server during normal deployment.

Enablement checklist:

- [`docs/operations/github-actions-enablement.md`](github-actions-enablement.md)

## Goals

1. Keep `develop` as the daily integration branch.
2. Keep `main` as the production-approved branch.
3. Run a repeatable quality gate before code can advance.
4. Make promotion auditable and fast-forward only.
5. Deploy production automatically only after images are built for the promoted,
   CI-validated revision.
6. Build and push immutable images before production deploys.
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

| Event | CI | Promotion | Docker build/push | production deploy |
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
| `.github/workflows/release.yml` | `release` | `detect` / `docker-build` / `deploy` | Build and push images, then deploy production |

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

### Job structure

`ci.yml` runs three jobs so the portal builds parallelize and one portal
failing still reports the others:

- `static-checks` - repo-global script, contract, and `docker compose config`
  checks that do not need portal `node_modules`.
- `portal-build` - a per-portal matrix (`website`, `console`, `admin`) with
  `fail-fast: false`; each leg type-checks and `next build` concurrently and
  caches its own `.next/cache`.
- `quality-gate` - an aggregator (`needs: [static-checks, portal-build]`) that
  carries the required status-check name.

Two constraints are load-bearing:

- The branch ruleset requires a check literally named `quality-gate`. After a
  job split, exactly one job must keep that name; the aggregator fills it and is
  skipped (treated as not-passing) if any upstream job fails. Renaming or
  removing it silently breaks merge gating and promotion.
- Each `portal-build` leg runs `npm ci` from inside `portals/<portal>` with a
  co-located `.npmrc`, not `npm ci --prefix portals/<portal>` from the repo
  root. The `--prefix` form authenticates the GitHub Packages metadata request
  but drops the token on the follow-up `/download/` tarball request, so cold
  installs fail with `401 Unauthorized`. The `${NODE_AUTH_TOKEN}` placeholder is
  written literally into `.npmrc` and substituted by npm at runtime so the
  secret never passes through shell expansion.

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
  do not trigger the downstream `ci -> docker-build -> deploy` chain.

Audit output:

- Print source branch, target branch, old target SHA, promoted SHA, actor, and
  release note.
- If a promotion PR convention is adopted later, the workflow should comment on
  that PR after successful promotion.

## Release Workflow

`release.yml` runs on `push` to `main` and contains the whole post-promotion
pipeline as three sequential jobs: `detect` (change detection, runs once),
`docker-build` (build/retag the six images), and `deploy` (SSH deploy).
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
last successful `release.yml` run on `main`. The path logic lives in one place,
`scripts/checks/classify_changes.py` (the workflow holds none of its own), and
follows an allow-list / default-skip model: a path ships nothing to the runtime
unless a rule explicitly claims it. Adding a new top-level path is therefore
non-deployable by default until a rule claims it - the safe direction (a missed
path skips, it never wrongly deploys). detect emits two outputs:

- `deployable` - true when any changed path maps to an image or is a deploy
  input; false otherwise. When false, `docker-build` and `deploy` both
  skip.
- `build_images` - the exact set of images to rebuild; every other image is
  retagged by digest, never rebuilt.

Authoritative path map (kept honest by the exhaustiveness guard below):

| Changed path | Result |
|---|---|
| `portals/website/**` | rebuild `ruyin-website` |
| `portals/console/**` | rebuild `ruyin-console` |
| `portals/admin/**` | rebuild `ruyin-admin` |
| `brand/**` | rebuild `ruyin-website` + `ruyin-console` + `ruyin-admin` (brand build-context) |
| `services/account/**`, `docker/ruyin-account-api.Dockerfile` | rebuild `ruyin-account-api` |
| `services/subproxy/**`, `docker/ruyin-subproxy.Dockerfile` | rebuild `ruyin-subproxy` |
| `docker/ruyin-nginx.Dockerfile` | rebuild `ruyin-nginx` |
| `configs/**`, `deploy/**`, `docker-compose.yml` | deployable, rebuild nothing |
| `docs/**`, `.claude/**`, `.github/**`, `scripts/**`, root `*.md` / `LICENSE` / dotfiles / `.env.example` | non-deployable, skip |

Outcomes:

| Change scope | deployable | build_images | Effect |
|---|---|---|---|
| docs / scripts / `.github` only | false | `[]` | `docker-build` and `deploy` skipped |
| `configs/*` or `deploy/*` only | true | `[]` | every image retags `:latest` to the per-commit tag (digest preserved); deploy re-renders config |
| image source (portal / service / brand) | true | changed set | rebuild the changed images, retag the rest, then deploy |

The retag path (`docker buildx imagetools create`) keeps the running container's
image digest stable, so a config-only release re-renders templates and reloads
nginx without a pointless container recreate.

No silent gaps. There is deliberately no "unknown path rebuilds everything"
fallback. Instead `scripts/checks/08-check-change-classifier.py` (run in
`quality-gate`) asserts every tracked file is claimed by a rule, so a new
image-context path cannot be merged unmapped - the failure surfaces at PR time,
not as a stale image in production. Adding a new image or top-level path means
adding its rule to `classify_changes.py` (the guard fails until you do).

Fail-open mechanism. The classification *default* is skip (safe), but a
classification *failure* is not: if the base SHA is unknown (first release) or
the compare API call fails, detect deploys and rebuilds all images. A gate that
cannot classify must never silently skip a real release.

Known limitation. A change to `release.yml`'s own build logic (build-args, base
image) counts as `.github/**` and is non-deployable, so it does not auto-rebuild
images. umbra has no shared-code "rebuild all" trigger - it consumes `@vxture/*`
as published packages with no local shared packages, so the only fan-out is
`brand/**`. An image-content build change must be triggered deliberately (touch
the relevant Dockerfile).

The `docker-build` job (and the `deploy` job) use the pushed SHA:

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
5. If ACR push fails, the workflow fails; production should not deploy.
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
| `ALIYUN_ACR_INTERNAL_HOST` | Internal pull host for production if available |

Compose contract:

`docker-compose.yml` must use the same repository names in `image:` fields.
For production deploys, `image:` should resolve to GHCR first and
Aliyun ACR second.

Example shape:

```yaml
services:
  umbra-website:
    image: ${IMAGE_REGISTRY}/${IMAGE_NAMESPACE}/ruyin-website:${IMAGE_TAG:-latest}
  umbra-account-web:
    image: ${IMAGE_REGISTRY}/${IMAGE_NAMESPACE}/ruyin-console:${IMAGE_TAG:-latest}
```

`IMAGE_REGISTRY` should point to GHCR on production. The deploy script may fall
back to Aliyun ACR after GHCR pull retries are exhausted. production is a Vultr
Tokyo server, so GHCR is the primary runtime pull source and the Hangzhou ACR
mirror is retained as a backup for the same immutable image tags.

## Deploy Job

The `deploy` job runs inside `release.yml` after the `build` job
completes successfully. It does not build images.

Job dependency and condition:

```yaml
needs: [detect, build]
if: ${{ needs.detect.outputs.deployable == 'true' }}
environment:
  name: production
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

bash deploy/deploy.sh all
bash deploy/deploy.sh verify
```

Notes:

- The deploy user must be non-root. `deploy.sh all` intentionally rejects root.
- The remote repo must not have local commits that prevent fast-forward.
- ACR login uses retry/backoff because first contact to the remote registry can
  intermittently hit TLS handshake timeouts.
- Image pull uses GHCR first. If GHCR image pulls fail after retries, deployment
  may switch to Aliyun ACR (`registry.cn-hangzhou.aliyuncs.com/vxture`) for the
  same immutable `sha-<short-sha>` tag.
- Runtime state remains on production under `.env`, `DATA_DIR`, and
  `BACKUP_DIR`; CI must not carry production secrets except SSH credentials.
- Config rendering and certificate lifecycle still belong to Umbra deploy
  scripts. `deploy/deploy.sh all` reaches `deploy/deploy.sh start`, which
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
| `DEPLOY_HOST` | Hostname or IP for production |
| `DEPLOY_USER` | Non-root deploy user, normally `stone` |
| `DEPLOY_SSH_KEY` | Private SSH key for the deploy user |
| `DEPLOY_PORT` | Optional SSH port, defaults to `22` |
| `DEPLOY_REPO_DIR` | Optional repo path, defaults to `/srv/vxture/repo/umbra` |
| `DEPLOY_KNOWN_HOSTS` | Optional pinned known_hosts line |
| `ALIYUN_ACR_REGISTRY` | ACR registry host used for image pulls |
| `ALIYUN_ACR_NAMESPACE` | ACR namespace, currently `vxture` |
| `ALIYUN_ACR_USERNAME` | Optional if production needs `docker login` |
| `ALIYUN_ACR_PASSWORD` | Optional if production needs `docker login` |

`DEPLOY_KNOWN_HOSTS` is recommended. Falling back to `ssh-keyscan` is easier
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

First-time enablement (secrets, rulesets, production prerequisites, and the
activation sequence) is covered by
[`github-actions-enablement.md`](github-actions-enablement.md).

## Non-Goals

- No beta branch in this phase.
- No automatic develop-to-main promotion without release confirmation.
- No production approval after `main` has already advanced.
- No tag-based semver release images until a release workflow is designed.
