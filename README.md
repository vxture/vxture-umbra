# Vxture Umbra

Production VPN edge node — SNI routing, VLESS+REALITY proxy, subscription delivery, password management.

**Stack:** Nginx · Xray REALITY · Marzban · Vaultwarden

---

## Services

| Domain | Service |
|--------|---------|
| `ruyin.ai` / `www.ruyin.ai` | Brand landing page |
| `vpn.ruyin.ai` | VPN user portal |
| `sub.ruyin.ai` | Marzban subscription endpoint |
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
bash /srv/vxture/repo/umbra/scripts/server-init.sh
```

`server-init.sh` creates the `stone` admin user (sudo + docker) and copies `/root/.ssh/authorized_keys` to the new user. **Your existing SSH key works for both root and stone.** Root SSH is left enabled — disable it manually after confirming `stone` login works.

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
SUB_DOMAIN=sub.ruyin.ai              # subscription endpoint
CONSOLE_DOMAIN=console.ruyin.ai
PASS_DOMAIN=pass.ruyin.ai
VAULT_DOMAIN=vault.ruyin.ai

# ── Marzban admin credentials ──────────────────────────
MARZBAN_ADMIN_USER=admin
MARZBAN_ADMIN_PASSWORD=              # openssl rand -base64 32
CONSOLE_HTPASSWD_PASSWORD=           # Nginx Basic Auth for console (bcrypt)

# ── Vaultwarden ─────────────────────────────────────────
VAULTWARDEN_ADMIN_TOKEN=             # openssl rand -base64 48

# ── Let's Encrypt ───────────────────────────────────────
CERTBOT_EMAIL=your@email.com

# ── VPN Users (created by deploy-post.sh) ───────────────
USER_COUNT=10
USER_PREFIX=user
```

Run the one-command deployment:

```bash
bash scripts/deploy-all.sh
```

| Step | Script | Action |
|------|--------|--------|
| 00 | `00-check-env.sh` | Validate env vars, Docker, DNS, ports |
| 01 | `01-init-dirs.sh` | Create data directory structure |
| 02 | `02-generate-reality.sh` | Generate REALITY x25519 keypair *(skip if exists)* |
| 03 | `03-issue-certs.sh` | Issue Let's Encrypt certs via certbot webroot *(skip if valid LE cert >30d)* |
| 04 | `04-render-configs.py` | Render all templates into `DATA_DIR` |
| 05 | `05-up.sh` | Pull images and start all containers |
| 06 | `06-verify.sh` | Verify all endpoints, containers, certs, databases |
| 07 | `07-backup.sh` | Create initial config backup |

After the deploy completes, run the post-deploy wizard:

```bash
bash scripts/deploy-post.sh
```

The wizard automatically:
1. Authenticates with the Marzban API and configures the inbound REALITY host
2. Creates VPN users (`USER_COUNT` × `USER_PREFIX` from `.env`)
3. Prints and saves Clash subscription URLs for each user
4. Checks that all 7 DNS records resolve to this server
5. Guides you through Vaultwarden account creation

Marzban subscription URLs use the native format `https://sub.ruyin.ai/sub/<token>`. The console may show a different token after refresh; older saved URLs can remain valid. Verify subscriptions with GET, not HEAD:

```bash
curl -sk -o /tmp/sub.yaml -w "%{http_code}\n" 'https://sub.ruyin.ai/sub/<token>'
```

Expected: `200`. `curl -I` sends HEAD and Marzban responds `405 Method Not Allowed`.

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

### Unified dispatcher

```bash
bash scripts/deploy.sh <command>

# Examples:
bash scripts/deploy.sh status                    # container status
bash scripts/deploy.sh logs umbra-nginx          # tail logs
bash scripts/deploy.sh restart umbra-marzban     # restart one service
bash scripts/deploy.sh config                    # re-render templates + nginx reload
bash scripts/deploy.sh certs --status            # show cert expiry
bash scripts/deploy.sh verify                    # run full verification suite
```

### Certificate management

```bash
bash scripts/deploy-certs.sh              # manual renewal check (also runs daily via cron)
bash scripts/deploy-certs.sh --status     # show expiry for all domains
bash scripts/deploy-certs.sh --upgrade    # force replace existing certs with new LE certs
```

Renewal runs daily at 03:17 via cron (added by `deploy-all.sh`).

### Reset and redeploy

```bash
# Soft reset: stop containers only, data preserved
bash scripts/server-reset.sh

# Full reset: destroy all data (prompts for YES)
bash scripts/server-reset.sh --full

# Redeploy after either reset
bash scripts/deploy-all.sh
```

> `--full` uses Docker internally to remove root-owned certbot files.

### Manual backup

```bash
bash scripts/steps/07-backup.sh
# Archives saved to BACKUP_DIR, 30-day retention
```

### Re-render config only

```bash
python3 scripts/steps/04-render-configs.py
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
bash scripts/deploy-certs.sh --upgrade
docker compose restart umbra-marzban
```

### console.ruyin.ai returns 403

Expected — the admin console is IP-restricted to the Docker network (VPN clients only). Connect to VPN first, then access the console.

---

## Scripts Reference

| Script | Purpose |
|--------|---------|
| `server-init.sh` | Bootstrap server: Docker, admin user, SSH key copy *(root, once)* |
| `server-reset.sh` | Stop or wipe deployment |
| `deploy.sh` | Unified dispatcher — run any step or operation by name |
| `deploy-all.sh` | Full deployment orchestrator (steps 00–07 + cron setup) |
| `deploy-certs.sh` | Certificate lifecycle: renew / upgrade / status |
| `deploy-post.sh` | Post-deploy wizard: host config, user creation, sub URLs |
| `steps/06-verify.sh` | Verify all services and endpoints |
| `steps/07-backup.sh` | Backup databases and config files |

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
                                               ├─ sub.ruyin.ai      → Marzban /sub/<token>
                                               ├─ console.ruyin.ai  → Marzban dashboard (IP restricted)
                                               ├─ pass.ruyin.ai     → Vaultwarden
                                               └─ vault.ruyin.ai    → placeholder
```

See [`docs/architecture.md`](docs/architecture.md) for full design reference.
