# Deployment Scenarios and Checklists

This document is the operational contract for Umbra deployments. Use it before
changing deployment scripts, domain variables, certificate handling, reset
behavior, or backup behavior.

The goal is predictable one-command deployment while preserving the right state
for each scenario.

## Entry Point Contract

Use only these primary entrypoints in new docs and operations:

| Entry point | Boundary | Owns |
|---|---|---|
| `bash scripts/server.sh <cmd>` | Server lifecycle | Host bootstrap and reset |
| `bash scripts/deploy.sh <cmd>` | Deployment lifecycle | Render repo/env into runtime services |
| `bash scripts/ops.sh <cmd>` | Operations lifecycle | Running-node maintenance |

Compatibility wrappers in `scripts/*.sh` exist only for older habits. Do not add
new behavior to wrapper scripts and do not reference them in new docs.

Local Clash Verge profile files under a user profile directory are not part of
Umbra deployment. They may only be edited when explicitly requested, and only the
`rules` section may be changed.

## State Inventory

| State | Path / owner | Must be preserved by normal deploy? | Notes |
|---|---|---:|---|
| Repository | `REPO_DIR` | Yes | Code, templates, scripts, docs |
| Environment secrets | `REPO_DIR/.env` | Yes | Never committed |
| Rendered nginx config | `DATA_DIR/nginx/` | Re-rendered | Generated from `configs/nginx/` |
| REALITY keys | `DATA_DIR/private/reality.json` | Yes | Regenerated only by explicit removal |
| Marzban database | `DATA_DIR/marzban/db.sqlite3` | Yes | User state and usage state |
| Marzban templates | `DATA_DIR/marzban/templates/` | Re-rendered | Generated subscription templates |
| Marzban Xray config | `DATA_DIR/marzban/xray_config.json` | Re-rendered | Generated config |
| Marzban TLS copy | `DATA_DIR/marzban/tls/` | Re-synced | Copy from selected edge cert |
| Vaultwarden data | `DATA_DIR/vaultwarden/data/` | Yes | DB plus attachments/sends |
| Certificates | `DATA_DIR/letsencrypt/` | Yes | Production cert state |
| Staged certificates | `DATA_DIR/letsencrypt.staged` | Yes until resolved | Retry state after partial issuance |
| Certificate backups | `DATA_DIR/letsencrypt.backup.*` | Yes | Rollback state |
| Backups | `BACKUP_DIR` | Yes unless full reset | Runtime archives |
| Containers | Docker Compose project | Recreated/restarted | No durable state should live only in containers |
| Cron jobs | deploy script installs | Yes | Renewal and backup cron |

## Preservation Matrix

| Command | Repo | `.env` | DATA_DIR | Certs | DB/user data | BACKUP_DIR | Containers | Ports |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `server.sh init` | Keep | Keep | Keep | Keep | Keep | Keep | No promise | No promise |
| `server.sh reset` | Keep | Keep | Keep | Keep | Keep | Keep | Stop/remove | Free 80/443 |
| `server.sh reset --full` | Keep | Keep | Remove | Remove | Remove | Remove | Stop/remove | Free 80/443 |
| `deploy.sh all` | Keep | Keep | Keep/re-render | Keep/issue missing | Keep | Create backup | Start/update | Use 80/443 |
| `deploy.sh config` | Keep | Keep | Re-render configs | Keep | Keep | Keep | Reload nginx only | Keep |
| `deploy.sh up` | Keep | Keep | Keep | Keep | Keep | Keep | Start/update | Use 80/443 |
| `ops.sh backup` | Keep | Keep | Read only | Read only | Read only | Add/prune old | Keep | Keep |
| `ops.sh certs --upgrade` | Keep | Keep | Keep | Stage then activate | Keep | Keep | Restart nginx/marzban after success | Use 80 |
| `ops.sh certs --renew` | Keep | Keep | Keep | Renew only due certs | Keep | Keep | Reload/restart only if renewed | Use 80 |
| `ops.sh restart` | Keep | Keep | Keep | Keep | Keep | Keep | Restart | Keep |
| `ops.sh reload` | Keep | Keep | Keep | Keep | Keep | Keep | Nginx reload only | Keep |

## Scenario Matrix

### S0 - New Server Bootstrap

Use when the VPS was just provisioned.

Commands:

```bash
ssh root@<server-ip>
git clone https://github.com/vxture/umbra.git /srv/vxture/repo/umbra
bash /srv/vxture/repo/umbra/scripts/server.sh init
```

Checklist:

```text
[ ] Run as root only for `server.sh init`
[ ] Confirm `stone` user exists and has sudo + docker group
[ ] Confirm SSH login works as `stone`
[ ] Confirm Docker works for `stone` after new login
[ ] Do not run deployment as root
```

Success criteria:

```text
[ ] `docker info` works as `stone`
[ ] `git -C /srv/vxture/repo/umbra status` works
[ ] Ports 80 and 443 are not occupied by a foreign service
```

### S1 - Fresh One-Command Deployment

Use when DATA_DIR is empty or absent and DNS is ready.

Commands:

```bash
ssh stone@<server-ip>
cd /srv/vxture/repo/umbra
cp .env.example .env
nano .env
bash scripts/deploy.sh all
bash scripts/deploy.sh post
bash scripts/deploy.sh verify
```

Preflight checklist:

```text
[ ] Current user is not root
[ ] `.env` exists and secrets are filled
[ ] All seven domains resolve to this server
[ ] Ports 80 and 443 are free, or owned by `umbra-nginx`
[ ] Docker Compose works
[ ] CERTBOT_EMAIL is set unless intentionally using no-email mode
[ ] CERTBOT_SKIP=false for real TLS, or true only for temporary self-signed mode
```

Success criteria:

```text
[ ] `docker compose ps` shows nginx, marzban, vaultwarden, portal running
[ ] `docker exec umbra-nginx nginx -t` succeeds
[ ] `bash scripts/ops.sh certs --status` shows trusted LE certs, unless in self-signed mode
[ ] `bash scripts/deploy.sh verify` completes or reports only documented auth-protected endpoints
[ ] `bash scripts/deploy.sh post` creates or skips expected users
[ ] Subscription URL uses `https://sub.ruyin.ai/sub/<token>`
```

### S2 - Normal Redeploy, Keep All Runtime Data

Use after code, docs, static site, template, or script updates.

Commands:

```bash
cd /srv/vxture/repo/umbra
git pull origin main
bash scripts/ops.sh backup
bash scripts/deploy.sh all
bash scripts/deploy.sh verify
```

Preservation contract:

```text
[ ] Keep `.env`
[ ] Keep DATA_DIR/private/reality.json
[ ] Keep DATA_DIR/letsencrypt
[ ] Keep Marzban users and DB
[ ] Keep Vaultwarden users and attachments
[ ] Keep BACKUP_DIR
```

Safety checklist:

```text
[ ] Backup finishes before deploy
[ ] No command removes DATA_DIR or BACKUP_DIR
[ ] Cert step reuses valid trusted LE certs
[ ] Config render does not require a missing cert path
[ ] Nginx test succeeds before reload
```

### S3 - Config-Only Redeploy

Use when only templates/static content changed and all required certificates
already exist.

Commands:

```bash
cd /srv/vxture/repo/umbra
git pull origin main
bash scripts/deploy.sh config
bash scripts/ops.sh reload
```

Preflight checklist:

```text
[ ] Cert files exist for every domain referenced by rendered nginx vhosts
[ ] `bash scripts/ops.sh certs --status` has no missing active domain
[ ] The new config does not introduce a new domain unless its cert already exists
```

If `deploy.sh config` fails:

```text
[ ] Do not restart nginx blindly
[ ] Read the printed `nginx -t` error
[ ] If missing cert path is reported, run `bash scripts/ops.sh certs --upgrade`
[ ] Re-run `bash scripts/deploy.sh config`
```

### S4 - Domain Change, Keep Data and Existing Certs

Use when changing `APEX_DOMAIN`, `EDGE_DOMAIN`, `SUB_DOMAIN`, or any public host.

Required order:

```bash
cd /srv/vxture/repo/umbra
git pull origin main
nano .env
bash scripts/ops.sh backup
bash scripts/ops.sh certs --upgrade
bash scripts/deploy.sh config
bash scripts/deploy.sh verify
```

Checklist:

```text
[ ] Update `.env` domain variable
[ ] Update related URL variable, e.g. SUBSCRIPTION_URL_PREFIX for SUB_DOMAIN
[ ] DNS A record resolves to the server before issuance
[ ] Do not run config reload before certificate exists, unless using self-signed mode
[ ] `certs --upgrade` runs in staging and leaves production certs untouched on failure
[ ] After success, rendered nginx cert paths point to active cert directories
[ ] Verify subscription URLs use the new domain
[ ] Verify old domain is absent unless an explicit alias was requested
```

Success criteria:

```text
[ ] `rg "old-domain"` returns no project reference, except historical docs explicitly retained
[ ] `bash scripts/ops.sh certs --status` shows the new domain
[ ] `docker exec umbra-nginx nginx -t` succeeds
[ ] Real GET to `https://sub.ruyin.ai/sub/<token>` returns 200 for valid token
```

### S5 - Recover After Failed Config Render or Reload

Use when configs rendered but nginx reload failed.

Commands:

```bash
cd /srv/vxture/repo/umbra
docker exec umbra-nginx nginx -t
bash scripts/ops.sh certs --status
```

Decision tree:

```text
[ ] If nginx complains about missing `/etc/letsencrypt/live/<domain>`, issue certs first
[ ] If nginx complains about syntax, fix template or rendered config source
[ ] If nginx complains about upstream/service names, check docker compose network/services
[ ] If nginx is still running, do not restart until config test succeeds
[ ] After fix, run `bash scripts/deploy.sh config`
```

Fallback only when the goal is to restore nginx loadability:

```bash
bash scripts/deploy/03-self-signed.sh
bash scripts/deploy.sh config
```

Self-signed mode is not a trusted client solution. It only makes nginx able to
start/reload while waiting for real certificate issuance.

### S6 - Soft Reset, Keep Config, Certs, and Data

Use when containers are stuck, ports are occupied, or a clean redeploy is needed.

Commands:

```bash
cd /srv/vxture/repo/umbra
bash scripts/server.sh reset
bash scripts/deploy.sh all
```

Expected preservation:

```text
[ ] DATA_DIR remains
[ ] BACKUP_DIR remains
[ ] `.env` remains
[ ] REALITY keys remain
[ ] Certs remain
[ ] Marzban and Vaultwarden data remain
```

Expected cleanup:

```text
[ ] Umbra containers stopped/removed by compose down
[ ] `certbot-nginx-tmp` removed if present
[ ] Ports 80 and 443 are free
[ ] Foreign port owners are not killed unless `FORCE_FREE_PORTS=true` is set
[ ] No runtime data directory is deleted
```

Success criteria:

```text
[ ] Reset output has separate Execution and Verification phases
[ ] Containers are absent or not running
[ ] Ports 80 and 443 are free
[ ] Redeploy starts from existing DATA_DIR without regenerating secrets
```

### S7 - Full Reset, Remove Runtime Data

Use only when intentionally rebuilding runtime state from scratch.

Commands:

```bash
cd /srv/vxture/repo/umbra
bash scripts/ops.sh backup
bash scripts/server.sh reset --full
bash scripts/deploy.sh all
bash scripts/deploy.sh post
```

Destructive contract:

```text
[ ] DATA_DIR is removed
[ ] BACKUP_DIR is removed
[ ] Certs are removed
[ ] REALITY keys are removed
[ ] Marzban users and DB are removed
[ ] Vaultwarden data is removed
[ ] Repo and `.env` remain
```

Mandatory confirmation:

```text
[ ] Script must require typing YES
[ ] Script must print removed paths before asking
[ ] Script must verify DATA_DIR and BACKUP_DIR are absent afterward
```

### S8 - Certificate Upgrade or Rate-Limit Recovery

Use when self-signed certs exist, a new domain was added, or a previous issuance
partially succeeded then failed.

Commands:

```bash
cd /srv/vxture/repo/umbra
bash scripts/ops.sh certs --status
bash scripts/ops.sh certs --clean-renewal-state
bash scripts/ops.sh certs --clean-workdirs
bash scripts/ops.sh certs --upgrade
```

Safety checklist:

```text
[ ] `certs --upgrade` uses DATA_DIR/letsencrypt.staged
[ ] Existing production certs remain untouched until every domain succeeds
[ ] Existing trusted LE certs are reused if not near expiry
[ ] Missing/non-trusted domains are issued only in staging
[ ] Partial staged successes are kept for retry
[ ] Zero-byte renewal configs are removed before renew/upgrade
[ ] Activation happens only after every staged cert is trusted LE, unexpired, and name-matched
[ ] Marzban TLS is synced after activation
[ ] Nginx and Marzban restart only after activation succeeds
```

Rate-limit handling:

```text
[ ] Do not delete valid staged certs after a failed run
[ ] Do not rerun forced issuance for domains already trusted in staging
[ ] Wait until the exact retry-after time for failed domains
[ ] Retry `certs --upgrade`; it should reuse staged successes
```

### S9 - Backup and Restore Readiness

Use before reset, deploy, domain change, or risky script changes.

Backup command:

```bash
bash scripts/ops.sh backup
```

Backup checklist:

```text
[ ] Marzban SQLite DB backup exists
[ ] Vaultwarden full data archive exists
[ ] Config/private archive exists
[ ] Crontab snapshot exists
[ ] Files are mode 600 where sensitive
[ ] Backups older than retention window are pruned intentionally
```

Restore is currently manual. Before relying on a backup, inspect archive contents:

```bash
ls -lt "$BACKUP_DIR" | head -20
tar -tzf "$BACKUP_DIR/umbra-config-<timestamp>.tar.gz" | sort
```

### S10 - Post-Deploy Users and Subscription URLs

Use after services and certs are healthy.

Commands:

```bash
bash scripts/deploy.sh post
```

Checklist:

```text
[ ] Marzban container is running and not restarting
[ ] Marzban admin exists or can be created
[ ] Marzban API auth succeeds
[ ] Host config points to EDGE_DOMAIN:443
[ ] Subscription prefix is `https://sub.ruyin.ai`
[ ] Saved subscription URL file is written to BACKUP_DIR
[ ] Use GET for subscription testing; HEAD can return 405
```

## Script Change Checklist

Run this before committing script changes.

```text
[ ] Identify lifecycle boundary: server, deploy, or ops
[ ] Confirm no operation crosses the wrong boundary
[ ] Confirm destructive actions are scoped to DATA_DIR/BACKUP_DIR and validated
[ ] Confirm root is rejected for deploy paths that write DATA_DIR
[ ] Confirm command failure prints the real stderr or next diagnostic command
[ ] Confirm nginx reload is always gated by `nginx -t`
[ ] Confirm cert replacement is staged, never in-place, unless explicitly self-signed recovery
[ ] Confirm valid LE certs are reused and not reissued
[ ] Confirm partial cert successes are preserved
[ ] Confirm backup runs before risky or destructive flows
[ ] Confirm docs mention new commands or changed behavior
```

Validation commands:

```bash
python3 scripts/deploy/08-check-script-contracts.py
bash -n scripts/deploy.sh scripts/ops.sh scripts/server.sh
bash -n scripts/deploy/*.sh scripts/ops/*.sh scripts/server/*.sh scripts/lib/*.sh
python3 -m py_compile scripts/deploy/04-render-configs.py scripts/deploy/07-validate-clash-rules.py scripts/deploy/08-check-script-contracts.py
git diff --check
```

`08-check-script-contracts.py` scans source inputs only: `.env.example`,
`README.md`, `docker-compose.yml`, `configs/`, `docs/`, and `scripts/`. It
intentionally ignores local `.env*` files, backups, runtime output, caches, and
binary assets.

Repository checks:

```bash
rg "<old-domain-or-variable>" .env.example README.md configs scripts docs docker-compose.yml
rg "rm -rf|docker run --rm|certbot certonly|nginx -t|nginx -s reload" scripts
```

## Domain Change Checklist

Use this whenever a public hostname changes.

```text
[ ] Update `.env.example`
[ ] Update README examples
[ ] Update docs/specs/domains.md
[ ] Update docs/deployment/deployment.md
[ ] Update docs/operations/operations.md
[ ] Update docs/design and docs/implementation references
[ ] Confirm scripts use variables, not hard-coded old domain
[ ] Confirm Nginx vhost uses the updated variable
[ ] Confirm certificate domain list includes the updated variable
[ ] Confirm must-direct rules include the updated variable
[ ] Confirm URL prefix variables match the domain variable
[ ] Confirm old domain is absent unless an alias was explicitly requested
[ ] Confirm new cert exists or will be issued before reload
```

## Final Release Checklist

Before pushing deployment-affecting changes:

```text
[ ] Working tree contains only intended files
[ ] No local Clash profile changes are included
[ ] `rg "<retired-domain>"` returns no unexpected matches
[ ] `git diff --check` passes
[ ] Python syntax checks pass
[ ] Bash syntax checks pass on a Linux host
[ ] Docs describe the exact server commands to run
[ ] Commit message names the operational change
[ ] Push completes
```
