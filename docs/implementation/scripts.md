# Script Implementation

Scripts are organized by lifecycle boundary.

## Entrypoints

| Entrypoint | Scope | Purpose |
|---|---|---|
| `scripts/server.sh` | Server | Bootstrap or reset the host machine |
| `scripts/deploy.sh` | Deploy | Build the service from repo/config into running containers |
| `scripts/ops.sh` | Ops | Operate an already deployed node |

## Internal Directories

| Directory | Purpose |
|---|---|
| `scripts/server/` | Server lifecycle implementation |
| `scripts/deploy/` | Deploy pipeline implementation |
| `scripts/ops/` | Runtime operations implementation |
| `scripts/lib/` | Shared shell helpers |

## Server Commands

| Command | Purpose |
|---|---|
| `bash scripts/server.sh init` | Install packages, Docker, admin user, SSH keys, firewall |
| `bash scripts/server.sh reset [--full]` | Stop containers or wipe runtime data after confirmation |

`server.sh reset` has a result contract:

- Soft reset must leave `DATA_DIR` and `BACKUP_DIR` intact, stop Umbra containers, remove `certbot-nginx-tmp`, and free ports 80/443.
- Full reset must stop Umbra containers, free ports 80/443, and remove `DATA_DIR` plus `BACKUP_DIR`.
- Both modes print separate execution and verification sections, then exit non-zero if containers are still running, required ports are still occupied, or full-reset data removal did not complete.

## Deploy Commands

| Command | Purpose |
|---|---|
| `bash scripts/deploy.sh all` | Run the full deploy pipeline and install cron jobs |
| `bash scripts/deploy.sh check` | Validate env, Docker, DNS, ports |
| `bash scripts/deploy.sh dirs` | Create runtime directories |
| `bash scripts/deploy.sh keys` | Generate or reuse REALITY keys |
| `bash scripts/deploy.sh certs` | Issue initial Let's Encrypt certificates |
| `bash scripts/deploy.sh config` | Render configs and reload nginx if running |
| `bash scripts/deploy.sh up` | Start containers |
| `bash scripts/deploy.sh verify` | Verify runtime behavior |
| `bash scripts/deploy.sh post` | Configure Marzban hosts, users, and subscription URLs |

## Ops Commands

| Command | Purpose |
|---|---|
| `bash scripts/ops.sh status` | Show container status |
| `bash scripts/ops.sh logs [service]` | Tail logs |
| `bash scripts/ops.sh restart [service]` | Restart services |
| `bash scripts/ops.sh reload` | Reload nginx |
| `bash scripts/ops.sh backup` | Create backup archives |
| `bash scripts/ops.sh certs --status` | Show certificate expiry |
| `bash scripts/ops.sh certs --renew` | Run certificate renewal check; reload services only when certbot renews something |
| `bash scripts/ops.sh certs --upgrade` | Stage new trusted certs, then activate only after all domains issue successfully |

Compatibility wrappers remain in the `scripts/` root for old server habits. Do not use them in new docs.

## Certificate Safety Rules

`scripts/ops.sh certs --upgrade` must never clear `DATA_DIR/letsencrypt` before issuance succeeds.

The required flow is:

1. Issue into `DATA_DIR/letsencrypt.new.<timestamp>`.
2. If any domain fails, delete the staged directory and leave production certs untouched.
3. If all domains succeed, move the existing `DATA_DIR/letsencrypt` to `DATA_DIR/letsencrypt.backup.<timestamp>`.
4. Move the staged directory into `DATA_DIR/letsencrypt`.
5. Sync the edge certificate into `DATA_DIR/marzban/tls`.
6. Restart nginx and Marzban.

If Marzban TLS sync or the service restart fails after activation, the script attempts to restore `DATA_DIR/letsencrypt.backup.<timestamp>` and moves the failed new directory to `DATA_DIR/letsencrypt.failed.<timestamp>`.

Certbot writes certificate files as root from inside Docker. Scripts must use `scripts/lib/certs.sh` for Marzban TLS sync instead of reading `privkey.pem` directly as the deploy user.
