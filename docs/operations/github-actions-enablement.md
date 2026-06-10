# GitHub Actions Enablement Checklist

Use this checklist when turning on the Umbra CI/CD workflows for the first
time. It assumes the design in `docs/operations/github-actions.md` is already
implemented.

## Required Repository Secrets

Configure these under repository settings before merging the workflow files to
the protected branches.

| Secret | Scope | Required | Notes |
|---|---|---:|---|
| `NODE_AUTH_TOKEN` | Actions secret | yes | Read access to GitHub Packages for private `@vxture/*` packages |
| `ALIYUN_ACR_REGISTRY` | Actions secret | yes | Example: `registry.cn-hangzhou.aliyuncs.com` |
| `ALIYUN_ACR_NAMESPACE` | Actions secret | yes | Current value: `vxture` |
| `ALIYUN_ACR_USERNAME` | Actions secret | yes | ACR push account for CI; also used by worker-03 if needed |
| `ALIYUN_ACR_PASSWORD` | Actions secret | yes | ACR password or access token |
| `PROMOTION_TOKEN` | Actions secret | yes | PAT used by promotion so the resulting `main` push triggers CI/CD |
| `WORKER_03_HOST` | Environment secret: `worker-03` | yes | Public hostname or IP |
| `WORKER_03_USER` | Environment secret: `worker-03` | yes | Non-root deploy user |
| `WORKER_03_SSH_KEY` | Environment secret: `worker-03` | yes | Private key for the deploy user |
| `WORKER_03_PORT` | Environment secret: `worker-03` | optional | Defaults to `22` |
| `WORKER_03_REPO_DIR` | Environment secret: `worker-03` | optional | Defaults to `/srv/vxture/repo/umbra` |
| `WORKER_03_KNOWN_HOSTS` | Environment secret: `worker-03` | recommended | Pin the SSH host key |

`worker-03` is a GitHub environment name. Keep deploy-only secrets there rather
than at repository-wide scope when possible.

Local operator source file:

```text
private/github-actions.local.env
```

The file is ignored by Git. Fill it from a password manager or other approved
secret store, then run:

```powershell
pwsh -File scripts/github/00-set-github-secrets.ps1 -DryRun
pwsh -File scripts/github/00-set-github-secrets.ps1
```

The script creates the `worker-03` GitHub environment if it does not already
exist, then writes repository secrets and environment secrets through `gh`.

## Repository Rulesets

Recommended branch rules:

| Branch | Required controls |
|---|---|
| `develop` | Require PR or maintainer-controlled merge; require `quality-gate` |
| `main` | Block direct human push; require linear history; allow only the promotion actor to update |

The promotion workflow must be the normal path for `develop -> main`.
`develop` CI success must not automatically update `main`.

## worker-03 Runtime Prerequisites

Before the first automated deploy:

- The repository exists on worker-03 at `WORKER_03_REPO_DIR`.
- The checkout can fetch `origin main`.
- The deploy user can run Docker and Docker Compose.
- The deploy user is not root; `deploy/worker-03/deploy.sh all` rejects root.
- `.env` exists on worker-03 and contains production runtime secrets.
- `.env` may keep local registry defaults for manual operations.
- `.env` should keep `IMAGE_NAMESPACE=vxture` when manual pulls use the Umbra
  owned repositories.
- The GitHub deploy workflow overrides worker-03 image pulls to GHCR first and
  Aliyun ACR fallback.
- Runtime state remains under `DATA_DIR` and `BACKUP_DIR`.

The GitHub deploy workflow overrides `IMAGE_TAG` with `sha-<short-sha>` for the
exact image set built by `docker-build`.

## First Enablement Sequence

1. Add repository and `worker-03` environment secrets, including
   `PROMOTION_TOKEN`.
2. Configure branch rulesets for `develop` and `main`.
3. Merge the CI/CD workflow files to `develop`.
4. Confirm `ci` passes on `develop`.
5. Run `branch-promotion` manually with `target=main`, `expected_sha`, a release
   note, and `release_confirmed=true`.
6. Confirm `ci` passes on `main`.
7. Confirm `docker-build` pushes all six images to GHCR and Aliyun ACR.
8. Confirm `deploy-worker-03` pulls the `sha-<short-sha>` images and verifies.

`PROMOTION_TOKEN` is required because GitHub does not trigger downstream
workflows from pushes made with the default `GITHUB_TOKEN`.
