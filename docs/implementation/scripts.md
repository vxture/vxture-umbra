# Script Implementation

Scripts are organized by lifecycle boundary.

## Entrypoints

| Entrypoint | Scope | Purpose |
|---|---|---|
| `deploy/server.sh` | Server | Bootstrap or reset the host machine |
| `deploy/deploy.sh` | Deploy | Build the service from repo/config into running containers |
| `deploy/ops.sh` | Ops | Operate an already deployed node |

## Internal Directories

| Directory | Purpose |
|---|---|
| `deploy/` | production server deployment package |
| `deploy/scripts/` | Numbered production deploy, ops, and recovery steps |
| `scripts/checks/` | Development and CI checks |
| `deploy/lib/` | Shared production shell helpers |

## Deploy Dependency Boundary

`deploy/` is the deploy-host control plane. It should contain
entrypoints, numbered deployment steps, ops scripts, recovery scripts, local
deploy examples, and deploy-local secret placeholders.

It must not own the shared runtime resources below:

| Root path | Why it stays at repo root |
|---|---|
| `docker-compose.yml` | Single compose contract for local checks, CI, image mapping, and server deployment |
| `configs/nginx/` | Shared Nginx templates rendered into `DATA_DIR/nginx/` |
| `configs/marzban/` | Shared Clash subscription template and must-direct rules rendered into `DATA_DIR/marzban/` |
| `services/subproxy/` | Subscription metadata adapter source |
| `services/account/` | Account/invite API source |

Deploy scripts may read, validate, render, mount, and operate those root paths.
They should not duplicate them inside `deploy/`. A deploy-specific
compose change belongs in a deploy-scoped override file, for example
`deploy/compose.override.yml`.

## Server Commands

| Command | Purpose |
|---|---|
| `bash deploy/server.sh init` | Install packages, Docker, admin user, SSH keys, firewall |
| `bash deploy/server.sh reset [--full]` | Stop containers or wipe runtime data after confirmation |

`server.sh reset` has a result contract:

- Soft reset must leave `DATA_DIR` and `BACKUP_DIR` intact, stop Umbra containers, remove `certbot-nginx-tmp`, and free ports 80/443.
- Full reset must stop Umbra containers, free ports 80/443, and remove `DATA_DIR` plus `BACKUP_DIR`.
- Both modes print separate execution and verification sections, then exit non-zero if containers are still running, required ports are still occupied, or full-reset data removal did not complete.

## Deploy Commands

| Command | Purpose |
|---|---|
| `bash deploy/deploy.sh all` | Run the full deploy pipeline and install cron jobs |
| `bash deploy/deploy.sh environment` | Validate env, Docker, DNS, ports |
| `bash deploy/deploy.sh directories` | Create runtime directories |
| `bash deploy/deploy.sh reality-keys` | Generate or reuse REALITY keys |
| `bash deploy/deploy.sh certificates` | Issue initial Let's Encrypt certificates |
| `bash deploy/deploy.sh config` | Render configs and reload nginx if running |
| `python3 deploy/scripts/19-check-clash-rules.py --config <default.yml>` | Validate generated Clash must-direct rules |
| `bash deploy/deploy.sh start` | Start containers and restart repo-mounted Python services |
| `bash deploy/deploy.sh verify` | Verify runtime behavior |
| `bash deploy/deploy.sh wizard` | Configure Marzban hosts, users, and subscription URLs |
| `python3 scripts/checks/06-check-deploy-contracts.py` | Static guardrails for high-risk script contracts |

## Ops Commands

| Command | Purpose |
|---|---|
| `bash deploy/ops.sh status` | Show container status |
| `bash deploy/ops.sh logs [service]` | Tail logs |
| `bash deploy/ops.sh restart [service]` | Restart services |
| `bash deploy/ops.sh reload` | Reload nginx |
| `bash deploy/ops.sh backup` | Create backup archives |
| `bash deploy/ops.sh certs --status` | Show certificate expiry |
| `bash deploy/ops.sh certs --renew` | Run certificate renewal check; reload services only when certbot renews something |
| `bash deploy/ops.sh certs --upgrade` | Stage new trusted certs, then activate only after all domains issue successfully |
| `bash deploy/ops.sh certs --clean-renewal-state` | Remove invalid zero-byte Certbot renewal configs |
| `bash deploy/ops.sh certs --clean-workdirs` | Migrate legacy staged state and remove obsolete certificate work directories |

Compatibility wrappers remain in the `scripts/` root for old server habits. Do not use them in new docs.

Before changing script behavior, use `docs/deployment/checklists.md` to choose
the intended scenario, preservation contract, and validation checklist. The
checklist is the operational contract for what a command may keep, overwrite, or
delete.

## Certificate Safety Rules

`deploy/ops.sh certs --upgrade` must never clear `DATA_DIR/letsencrypt` before issuance succeeds.

`deploy.sh all` must detect existing self-signed, staging, fake, unreadable, or otherwise non-trusted cert directories and route certificate replacement through `deploy/ops.sh certs --upgrade`.

The required upgrade flow is:

1. Normalize certificate workdirs: migrate the newest legacy `letsencrypt.new.*` to `DATA_DIR/letsencrypt.staged` if no staged dir exists, then remove obsolete `letsencrypt.new.*` and `letsencrypt.failed.*` dirs.
2. Copy the current `DATA_DIR/letsencrypt` into `DATA_DIR/letsencrypt.staged` so valid existing LE certs can be reused. If this staged directory already exists from a prior failed attempt, keep it and resume from it.
3. Remove invalid zero-byte renewal configs from the staged directory.
4. Remove non-trusted domain state from the staged directory only.
5. Reuse existing trusted LE certificates that are not near expiry.
6. Issue only missing, expiring, or non-trusted certificates inside the staged directory.
7. If any domain fails, keep the staged directory and leave production certs untouched. Keeping staged state preserves any domain certificates that were successfully issued before a later domain failed.
8. If all domains succeed, independently verify that every staged domain has a trusted, unexpired, name-matched LE certificate.
9. Move the existing `DATA_DIR/letsencrypt` to `DATA_DIR/letsencrypt.backup.<timestamp>`.
10. Move `DATA_DIR/letsencrypt.staged` into `DATA_DIR/letsencrypt`.
11. Sync the edge certificate into `DATA_DIR/marzban/tls`.
12. Restart nginx and Marzban.

If Marzban TLS sync or the service restart fails after activation, the script attempts to restore `DATA_DIR/letsencrypt.backup.<timestamp>` and moves the failed new directory to `DATA_DIR/letsencrypt.failed.<timestamp>`.

Certbot writes certificate files as root from inside Docker. Scripts must use `deploy/lib/02-certs.sh` for Marzban TLS sync instead of reading `privkey.pem` directly as the deploy user.

Certificate scripts must validate domain names before building paths under `live/`, `archive/`, or `renewal/`.

`certs --renew` must not force reissue. It delegates to `certbot renew`, which only renews Certbot-managed certificates that are due, and it first removes invalid zero-byte renewal configs so failed prior issuance attempts do not pollute renewal state.
