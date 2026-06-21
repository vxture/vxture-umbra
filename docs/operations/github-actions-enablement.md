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
| `ALIYUN_ACR_USERNAME` | Actions secret | yes | ACR push account for CI; also used by production if needed |
| `ALIYUN_ACR_PASSWORD` | Actions secret | yes | ACR password or access token |
| `PROMOTION_TOKEN` | Actions secret | yes | PAT used by promotion so the resulting `main` push triggers CI/CD |
| `DEPLOY_HOST` | Environment secret: `production` | yes | Public hostname or IP |
| `DEPLOY_USER` | Environment secret: `production` | yes | Non-root deploy user |
| `DEPLOY_SSH_KEY` | Environment secret: `production` | yes | Private key for the deploy user |
| `DEPLOY_PORT` | Environment secret: `production` | optional | Defaults to `22` |
| `DEPLOY_REPO_DIR` | Environment secret: `production` | optional | Defaults to `/srv/vxture/repo/umbra` |
| `DEPLOY_KNOWN_HOSTS` | Environment secret: `production` | recommended | Pin the SSH host key |

`production` is a GitHub environment name. Keep deploy-only secrets there rather
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

The script creates the `production` GitHub environment if it does not already
exist, then writes repository secrets and environment secrets through `gh`.

## Repository Rulesets

Recommended branch rules:

| Branch | Required controls |
|---|---|
| `develop` | Require PR or maintainer-controlled merge; require `quality-gate` |
| `main` | Block direct human push; require linear history; allow only the promotion actor to update |

The promotion workflow must be the normal path for `develop -> main`.
`develop` CI success must not automatically update `main`.

## Production Runtime Prerequisites

Before the first automated deploy:

- The repository exists on production at `DEPLOY_REPO_DIR`.
- The checkout can fetch `origin main`.
- The deploy user can run Docker and Docker Compose.
- The deploy user is not root; `deploy/deploy.sh all` rejects root.
- `.env` exists on production and contains production runtime secrets.
- `.env` may keep local registry defaults for manual operations.
- `.env` should keep `IMAGE_NAMESPACE=vxture` when manual pulls use the Umbra
  owned repositories.
- The GitHub deploy workflow overrides production image pulls to GHCR first and
  Aliyun ACR fallback.
- Runtime state remains under `DATA_DIR` and `BACKUP_DIR`.

The GitHub deploy workflow overrides `IMAGE_TAG` with `sha-<short-sha>` for the
exact image set built by `docker-build`.

## First Enablement Sequence

1. Add repository and `production` environment secrets, including
   `PROMOTION_TOKEN`.
2. Configure branch rulesets for `develop` and `main`.
3. Merge the CI/CD workflow files to `develop`.
4. Confirm `ci` passes on `develop`.
5. Run `branch-promotion` manually with `target=main`, `expected_sha`, a release
   note, and `release_confirmed=true`.
6. Confirm `ci` passes on `main`.
7. Confirm `docker-build` pushes all six images to GHCR and Aliyun ACR.
8. Confirm `deploy` pulls the `sha-<short-sha>` images and verifies.

`PROMOTION_TOKEN` is required because GitHub does not trigger downstream
workflows from pushes made with the default `GITHUB_TOKEN`.
