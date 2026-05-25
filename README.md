# Vxture Umbra

Production VPN edge node — SNI routing, VLESS+REALITY proxy, subscription delivery, password management.

**Stack:** Nginx · Xray REALITY · Marzban · Vaultwarden

**AI coding entry:** start with [docs/agent.md](docs/agent.md). For deploy/reset/cert changes, use [docs/deployment/checklists.md](docs/deployment/checklists.md) before editing scripts.

---

## Services

| Domain | Service |
|--------|---------|
| `ruyin.ai` / `www.ruyin.ai` | Brand landing page |
| `vpn.ruyin.ai` | VPN user portal |
| `subscribe.ruyin.ai` | Marzban subscription endpoint |
| `console.ruyin.ai` | Marzban admin *(VPN access only)* |
| `pass.ruyin.ai` | Vaultwarden password manager |
| `vault.ruyin.ai` | Placeholder (future use) |

---

## Prerequisites

| Requirement | Notes |
|-------------|-------|
| Ubuntu 26.04 LTS | Vultr or similar; 1C1G / 25GB SSD |
| SSH key access | Key-based login as root (Vultr adds this at provision time) |
| DNS A records | All 7 domains → server IP, propagated **before** running deploy |
| Open ports | 80 (ACME) and 443 (HTTPS + REALITY) |

> **DNS first.** Let's Encrypt cert issuance is the first blocking step. Point all 7 records before starting.

---

## Initial Server Setup

SSH in as root using the key provided at server creation:

```bash
ssh root@<server-ip>
```

Clone the repo and bootstrap the server (installs Docker, creates admin user, copies SSH keys):

```bash
git clone https://github.com/vxture/umbra.git /srv/vxture/repo/umbra
bash /srv/vxture/repo/umbra/scripts/server.sh init
```

`server.sh init` creates the `stone` admin user (sudo + docker) and copies `/root/.ssh/authorized_keys` to the new user. **Your existing SSH key works for both root and stone.** Root SSH is left enabled — disable it manually after confirming `stone` login works.

---

## Deploy

Open a new SSH session as the admin user:

```bash
ssh stone@<server-ip>
cd /srv/vxture/repo/umbra
```

Configure the environment:

```bash
cp .env.example .env
nano .env
```

Required values to fill in:

```bash
# ── Node Identity ──────────────────────────────────────
NODE_NAME=vx-tokyo                    # label shown in subscription config

# ── Domains ────────────────────────────────────────────
APEX_DOMAIN=ruyin.ai
WWW_DOMAIN=www.ruyin.ai
EDGE_DOMAIN=vpn.ruyin.ai             # VPN user portal
SUB_DOMAIN=subscribe.ruyin.ai              # subscription endpoint
CONSOLE_DOMAIN=console.ruyin.ai
PASS_DOMAIN=pass.ruyin.ai
VAULT_DOMAIN=vault.ruyin.ai

# ── Marzban admin credentials ──────────────────────────
MARZBAN_ADMIN_USER=admin
MARZBAN_ADMIN_PASSWORD=              # openssl rand -base64 32

# ── Vaultwarden ─────────────────────────────────────────
VAULTWARDEN_ADMIN_TOKEN=             # openssl rand -base64 48

# ── Let's Encrypt ───────────────────────────────────────
CERTBOT_EMAIL=your@email.com

# ── VPN Users (created by deploy.sh post) ───────────────
USER_COUNT=10
USER_PREFIX=user
```

### First Deploy

```bash
bash scripts/deploy.sh all
bash scripts/deploy.sh post
bash scripts/deploy.sh verify
docker exec umbra-nginx nginx -t
```

### Redeploy, Keep Data

Use this for normal code/config updates. It preserves existing certs, REALITY keys, databases, Vaultwarden data, and users.

```bash
cd /srv/vxture/repo/umbra
git pull origin main

bash scripts/ops.sh backup
bash scripts/deploy.sh all
bash scripts/deploy.sh post
bash scripts/deploy.sh verify
docker exec umbra-nginx nginx -t
```

### Full Reset and Redeploy

Use this only when you intentionally want to destroy runtime data and rebuild from scratch. Make sure the backup command has completed first.

```bash
cd /srv/vxture/repo/umbra
git pull origin main

bash scripts/ops.sh backup
bash scripts/server.sh reset --full
bash scripts/deploy.sh all
bash scripts/deploy.sh post
bash scripts/deploy.sh verify
docker exec umbra-nginx nginx -t
```

`deploy.sh all` runs checks, initializes directories, creates or reuses REALITY keys, issues certificates, renders configs, starts containers, verifies, and backs up. `deploy.sh post` configures Marzban hosts, creates users if missing, and saves subscription URLs.

For normal production deploys, keep:

```env
CERTBOT_SKIP=false
MARZBAN_SSL_CA_TYPE=public
```

If Let's Encrypt is temporarily unavailable or rate-limited, use self-signed recovery mode only until real certificates can be issued:

```env
CERTBOT_SKIP=true
MARZBAN_SSL_CA_TYPE=private
```

After the rate limit window passes, switch back to `MARZBAN_SSL_CA_TYPE=public` and run `bash scripts/ops.sh certs --upgrade`. The upgrade command stages new certificates first; valid existing LE certs are reused, and if issuance fails the existing production certificates are left untouched.

Marzban subscription URLs use the native format `https://subscribe.ruyin.ai/sub/<token>`. The console may show a different token after refresh; older saved URLs can remain valid. Verify subscriptions with GET, not HEAD:

```bash
curl -sk -o /tmp/sub.yaml -w "%{http_code}\n" 'https://subscribe.ruyin.ai/sub/<token>'
```

Expected: `200`. `curl -I` sends HEAD and Marzban responds `405 Method Not Allowed`.

Clash subscription files include a profile header named `Ruyin-USERNAME`, for example `Ruyin-USER01`, while the proxy node name remains `NODE_NAME`.

---

## Post-Deploy: Manual Tasks

### Lock Down Vaultwarden

Open `https://pass.ruyin.ai/admin`, enter your `VAULTWARDEN_ADMIN_TOKEN`, then go to **Users → Invite User** to create your account via email invite. Web registration is disabled by default — accounts must be created through the admin panel.

### Optional: Harden SSH

After confirming `stone` SSH login works, disable root login:

```bash
sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config && systemctl reload sshd
```

### Optional: External Uptime Monitoring

Add free monitors at [BetterStack](https://betterstack.com) or [UptimeRobot](https://uptimerobot.com):
- TCP `vpn.ruyin.ai:443` — catches full-node outage
- HTTPS `https://vpn.ruyin.ai` — catches nginx failures

---

## Operations

### Dispatchers

```bash
bash scripts/deploy.sh <command>   # deployment lifecycle
bash scripts/ops.sh <command>      # runtime operations

# Examples:
bash scripts/ops.sh status                       # container status
bash scripts/ops.sh logs umbra-nginx             # tail logs
bash scripts/ops.sh restart umbra-marzban        # restart one service
bash scripts/deploy.sh config                    # re-render templates + nginx reload
bash scripts/ops.sh certs --status               # show cert expiry
bash scripts/deploy.sh verify                    # run full verification suite
```

### Certificate management

```bash
bash scripts/ops.sh certs --renew              # manual renewal check (also runs daily via cron)
bash scripts/ops.sh certs --status     # show expiry for all domains
bash scripts/ops.sh certs --upgrade    # staged upgrade to trusted LE certs; partial successes are kept
bash scripts/ops.sh certs --clean-renewal-state  # remove invalid zero-byte renewal configs
bash scripts/ops.sh certs --clean-workdirs       # normalize obsolete staged workdirs
```

Renewal runs daily at 03:17 via cron (added by `deploy.sh all`). It delegates to `certbot renew`, so it does not force reissue. Services reload only when certbot actually renews a certificate.

### Reset and redeploy

```bash
# Normal redeploy, data preserved
git pull origin main
bash scripts/ops.sh backup
bash scripts/server.sh reset
bash scripts/deploy.sh all
bash scripts/deploy.sh post

# Full reset, destroys runtime data after confirmation
bash scripts/ops.sh backup
bash scripts/server.sh reset --full
bash scripts/deploy.sh all
bash scripts/deploy.sh post
```

> `--full` uses Docker internally to remove root-owned certbot files.
> `server.sh reset` prints separate execution and verification sections, and exits non-zero if Umbra containers are still running or ports 80/443 remain occupied.
> Foreign port owners are reported, not killed automatically; set `FORCE_FREE_PORTS=true` only when the process is safe to terminate.

### Manual backup

```bash
bash scripts/ops.sh backup
# Archives saved to BACKUP_DIR, 30-day retention
```

### Re-render config only

```bash
python3 scripts/deploy/04-render-configs.py
# or
bash scripts/deploy.sh config
```

`04-render-configs.py` is a Python script; do not run it with `bash`.

---

## Troubleshooting

### Red HTTPS in browser after first deploy

Certbot ran but nginx still serves old cert. Restart nginx:

```bash
docker compose restart umbra-nginx
```

### `rm -rf letsencrypt` — Permission denied

Certbot runs as root inside Docker; its files are root-owned. Clean them via Docker:

```bash
docker run --rm -v /srv/vxture/data/umbra/letsencrypt:/target alpine sh -c 'rm -rf /target/*'
```

### Marzban crash-loops on startup

Marzban (newer versions) requires a valid non-self-signed TLS cert to bind to `0.0.0.0`. Run real cert issuance first:

```bash
bash scripts/ops.sh certs --upgrade
docker compose restart umbra-marzban
```

### console.ruyin.ai returns 403

Expected — the admin console is IP-restricted to the Docker network (VPN clients only). Connect to VPN first, then access the console.

---

## Scripts Reference

| Script | Purpose |
|--------|---------|
| `server.sh init` | Bootstrap server: Docker, admin user, SSH key copy *(root, once)* |
| `server.sh reset` | Stop or wipe deployment |
| `deploy.sh` | Unified dispatcher — run any step or operation by name |
| `deploy.sh all` | Full deployment orchestrator (steps 00–07 + cron setup) |
| `ops.sh certs` | Certificate lifecycle: renew / upgrade / status |
| `deploy.sh post` | Post-deploy wizard: host config, user creation, sub URLs |
| `deploy/06-verify.sh` | Verify all services and endpoints |
| `ops/backup.sh` | Backup databases and config files |

---

## Architecture

```
Internet
   │
   ├─ :80  → nginx HTTP → ACME challenge / 301 redirect to HTTPS
   │
   └─ :443 → nginx stream (SNI preread)
                ├─ SNI = www.microsoft.com → Xray VLESS+REALITY (port 10443 internal)
                └─ SNI = anything else     → nginx HTTP block (:8443)
                                               ├─ ruyin.ai          → landing page
                                               ├─ vpn.ruyin.ai      → VPN portal
                                               ├─ subscribe.ruyin.ai      → Marzban /sub/<token>
                                               ├─ console.ruyin.ai  → Marzban dashboard (IP restricted)
                                               ├─ pass.ruyin.ai     → Vaultwarden
                                               └─ vault.ruyin.ai    → placeholder
```

See [`docs/agent.md`](docs/agent.md) for the AI-maintainer document map and [`docs/design/architecture.md`](docs/design/architecture.md) for the full architecture reference.
