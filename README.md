# Vxture Umbra

Production VPN edge node - SNI routing, VLESS+REALITY proxy, subscription delivery, password management, public website.

**Stack:** Nginx / Xray REALITY / Marzban / umbra-website (Next.js) / Vaultwarden

**AI coding entry:** start with [docs/agent.md](docs/agent.md). For deploy/reset/cert changes, use [docs/deployment/checklists.md](docs/deployment/checklists.md) before editing scripts.

---

## Services

| Domain | Service |
|--------|---------|
| `ruyin.ai` / `www.ruyin.ai` | Brand landing page (Next.js) |
| `vpn.ruyin.ai` | VPN proxy node host (REALITY on `:443`); no web surface |
| `sub.ruyin.ai` | Marzban subscription endpoint with `Ruyin-USERNAME` display names |
| `console.ruyin.ai` | User self-service console |
| `admin.ruyin.ai` | Marzban console *(Marzban login)* |
| `admin.ruyin.ai/invites` | Invite console for binding existing Marzban users |
| `pas.ruyin.ai` | Vaultwarden password manager |

---

## Prerequisites

| Requirement | Notes |
|-------------|-------|
| Ubuntu 26.04 LTS | Vultr or similar; 1C1G / 25GB SSD |
| SSH key access | Key-based login as root (Vultr adds this at provision time) |
| DNS A records | Active domains -> server IP, propagated **before** running deploy |
| Open ports | 80 (ACME) and 443 (HTTPS + REALITY) |

> **DNS first.** Let's Encrypt cert issuance is the first blocking step. Point active domain records before starting.

---

## Local Development Ports

Umbra uses a dedicated local-only port block so it stays clear of the Vxture
monorepo development ports. These ports are for direct browser preview and
local service debugging only.

| Port | Service | URL |
|------|---------|-----|
| 3210 | Ruyin website | `http://localhost:3210` |
| 3220 | Ruyin console | `http://localhost:3220` |
| 3281 | Account API | `http://localhost:3281` |

Reserve `3210`, `3220`, and `3281` for Umbra. If local Vxture SSO origin checks
are enabled, allow `http://localhost:3220` as the Umbra console callback origin.

Production does not expose these ports. Public production traffic enters only
through Nginx on host ports `80` and `443`; Nginx then proxies to `3210`,
`3220`, and `3281` inside the Docker network.

---

## Initial Server Setup

SSH in as root using the key provided at server creation:

```bash
ssh root@<server-ip>
```

Clone the repo and bootstrap the server (installs Docker, creates admin user, copies SSH keys):

```bash
git clone https://github.com/vxture/umbra.git /srv/umbra/deploy
bash /srv/umbra/deploy/deploy/server.sh init
```

`server.sh init` creates the `stone` admin user (sudo + docker) and copies `/root/.ssh/authorized_keys` to the new user. **Your existing SSH key works for both root and stone.** Root SSH is left enabled - disable it manually after confirming `stone` login works.

---

## Deploy

Open a new SSH session as the admin user:

```bash
ssh stone@<server-ip>
cd /srv/umbra/deploy
```

Configure the environment:

```bash
cp .env.example .env
nano .env
```

Required values to fill in:

```bash
# -- Node Identity --------------------------------------
NODE_NAME=vx-tokyo                    # label shown in subscription config

# -- Domains --------------------------------------------
APEX_DOMAIN=ruyin.ai
WWW_DOMAIN=www.ruyin.ai
EDGE_DOMAIN=vpn.ruyin.ai             # VPN proxy node host (REALITY :443)
SUB_DOMAIN=sub.ruyin.ai              # subscription endpoint
CONSOLE_DOMAIN=console.ruyin.ai
ADMIN_DOMAIN=admin.ruyin.ai
PASS_DOMAIN=pas.ruyin.ai

# -- Marzban admin credentials --------------------------
MARZBAN_ADMIN_USER=admin
MARZBAN_ADMIN_PASSWORD=              # openssl rand -base64 32

# -- Vaultwarden -----------------------------------------
VAULTWARDEN_ADMIN_TOKEN=             # openssl rand -base64 48

# -- Account portal --------------------------------------
ACCOUNT_SESSION_SECRET=              # openssl rand -base64 48
ACCOUNT_INVITE_SECRET=               # openssl rand -base64 48
ACCOUNT_INVITE_TTL_DAYS=30

# -- Let's Encrypt ---------------------------------------
CERTBOT_EMAIL=your@email.com

# -- VPN Users (created by deploy.sh wizard) ---------------
USER_COUNT=10
USER_PREFIX=user
```

### First Deploy

```bash
bash deploy/deploy.sh all
bash deploy/deploy.sh wizard
bash deploy/deploy.sh verify
docker exec umbra-nginx nginx -t
```

### Redeploy, Keep Data

Use this for normal code/config updates. It preserves existing certs, REALITY keys, databases, Vaultwarden data, and users.

```bash
cd /srv/umbra/deploy
git pull origin main

bash deploy/ops.sh backup
bash deploy/deploy.sh all
bash deploy/deploy.sh wizard
bash deploy/deploy.sh verify
docker exec umbra-nginx nginx -t
```

### Full Reset and Redeploy

Use this only when you intentionally want to destroy runtime data and rebuild from scratch. Make sure the backup command has completed first.

```bash
cd /srv/umbra/deploy
git pull origin main

bash deploy/ops.sh backup
bash deploy/server.sh reset --full
bash deploy/deploy.sh all
bash deploy/deploy.sh wizard
bash deploy/deploy.sh verify
docker exec umbra-nginx nginx -t
```

`deploy.sh all` runs checks, initializes directories, creates or reuses REALITY keys, issues certificates, renders configs, starts containers, verifies, and backs up. `deploy.sh wizard` configures Marzban hosts, creates users if missing, and saves subscription URLs.

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

After the rate limit window passes, switch back to `MARZBAN_SSL_CA_TYPE=public` and run `bash deploy/ops.sh certs --upgrade`. The upgrade command stages new certificates first; valid existing LE certs are reused, and if issuance fails the existing production certificates are left untouched.

Marzban subscription URLs use the native format `https://sub.ruyin.ai/sub/<token>`. The console may show a different token after refresh; older saved URLs can remain valid. Verify subscriptions with GET, not HEAD:

```bash
curl -sk -o /tmp/sub.yaml -w "%{http_code}\n" 'https://sub.ruyin.ai/sub/<token>'
```

Expected: `200`. `curl -I` sends HEAD and Marzban responds `405 Method Not Allowed`.

Clash subscription files and response headers are normalized to `Ruyin-USERNAME`, for example `Ruyin-USER01`, while the proxy node name remains `NODE_NAME`.

User-facing subscription access is handled by `https://console.ruyin.ai`. The console shows the locally bound subscription URL, provides a copy-only field, and resets the stored URL from Marzban only when the user clicks `Reset subscription URL`. Admins open `https://admin.ruyin.ai/invites`, sign in with the Marzban admin account, and generate a one-time invite link for an existing Marzban user such as `USER08`. The invite console shows the same stored URL for bound users and uses the same reset action, so admin and user views stay aligned. The invite link binds only that user code; the registrant cannot choose another `USER**` value.

---

## Post-Deploy: Manual Tasks

### Lock Down Vaultwarden

Open `https://pas.ruyin.ai/admin`, enter your `VAULTWARDEN_ADMIN_TOKEN`, then go to **Users -> Invite User** to create your account via email invite. Web registration is disabled by default - accounts must be created through the admin panel.

### Optional: Harden SSH

After confirming `stone` SSH login works, disable root login:

```bash
sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config && systemctl reload sshd
```

### Optional: External Uptime Monitoring

Add free monitors at [BetterStack](https://betterstack.com) or [UptimeRobot](https://uptimerobot.com):
- TCP `vpn.ruyin.ai:443` - catches full-node outage
- HTTPS `https://sub.ruyin.ai` - catches nginx/subscription failures

---

## Operations

### Dispatchers

```bash
bash deploy/deploy.sh <command>   # deployment lifecycle
bash deploy/ops.sh <command>      # runtime operations

# Examples:
bash deploy/ops.sh status                       # container status
bash deploy/ops.sh logs umbra-nginx             # tail logs
bash deploy/ops.sh restart umbra-marzban        # restart one service
bash deploy/deploy.sh config                    # re-render templates + nginx reload
bash deploy/ops.sh certs --status               # show cert expiry
bash deploy/deploy.sh verify                    # run full verification suite
```

### Certificate management

```bash
bash deploy/ops.sh certs --renew              # manual renewal check (also runs daily via cron)
bash deploy/ops.sh certs --status     # show expiry for all domains
bash deploy/ops.sh certs --upgrade    # staged upgrade to trusted LE certs; partial successes are kept
bash deploy/ops.sh certs --clean-renewal-state  # remove invalid zero-byte renewal configs
bash deploy/ops.sh certs --clean-workdirs       # normalize obsolete staged workdirs
```

Renewal runs daily at 03:17 via cron (added by `deploy.sh all`). It delegates to `certbot renew`, so it does not force reissue. Services reload only when certbot actually renews a certificate.

### Reset and redeploy

```bash
# Normal redeploy, data preserved
git pull origin main
bash deploy/ops.sh backup
bash deploy/server.sh reset
bash deploy/deploy.sh all
bash deploy/deploy.sh wizard

# Full reset, destroys runtime data after confirmation
bash deploy/ops.sh backup
bash deploy/server.sh reset --full
bash deploy/deploy.sh all
bash deploy/deploy.sh wizard
```

> `--full` uses Docker internally to remove root-owned certbot files.
> `server.sh reset` prints separate execution and verification sections, and exits non-zero if Umbra containers are still running or ports 80/443 remain occupied.
> Foreign port owners are reported, not killed automatically; set `FORCE_FREE_PORTS=true` only when the process is safe to terminate.

### Manual backup

```bash
bash deploy/ops.sh backup
# Archives saved to BACKUP_DIR, 30-day retention
```

### Re-render config only

```bash
python3 deploy/scripts/22-render-runtime-configs.py
# or
bash deploy/deploy.sh config
```

`22-render-runtime-configs.py` is a Python script; do not run it with `bash`.

---

## Troubleshooting

### Red HTTPS in browser after first deploy

Certbot ran but nginx still serves old cert. Restart nginx:

```bash
docker compose restart umbra-nginx
```

### `rm -rf letsencrypt` - Permission denied

Certbot runs as root inside Docker; its files are root-owned. Clean them via Docker:

```bash
docker run --rm -v /srv/umbra/data/letsencrypt:/target alpine sh -c 'rm -rf /target/*'
```

### Marzban crash-loops on startup

Marzban (newer versions) requires a valid non-self-signed TLS cert to bind to `0.0.0.0`. Run real cert issuance first:

```bash
bash deploy/ops.sh certs --upgrade
docker compose restart umbra-marzban
```

### admin.ruyin.ai returns 403

Not expected. The admin vhost is public and Marzban handles login. Re-render nginx config and verify the rendered `07-admin.conf` has no `allow` / `deny all` rules:

```bash
bash deploy/deploy.sh config
curl -sk -o /dev/null -w "%{http_code}\n" https://admin.ruyin.ai/dashboard/
```

---

## Scripts Reference

| Script | Purpose |
|--------|---------|
| `server.sh init` | Bootstrap server: Docker, admin user, SSH key copy *(root, once)* |
| `server.sh reset` | Stop or wipe deployment |
| `deploy.sh` | Unified dispatcher - run any step or operation by name |
| `deploy.sh all` | Full deployment orchestrator (steps 00-07 + cron setup) |
| `ops.sh certs` | Certificate lifecycle: renew / upgrade / status |
| `deploy.sh wizard` | Post-deploy wizard: host config, user creation, sub URLs |
| `deploy/scripts/24-verify-deployment.sh` | Verify all services and endpoints |
| `ops/backup.sh` | Backup databases and config files |

---

## Architecture

```
Internet
   |
   |- :80  -> nginx HTTP -> ACME challenge / 301 redirect to HTTPS
   |
   `- :443 -> nginx stream (SNI preread)
                 |- SNI = www.icloud.com    -> Xray VLESS+REALITY (port 10443 internal)
                 `- SNI = anything else     -> nginx HTTP block (:8443)
                                                |- ruyin.ai          -> umbra-website (Next.js landing)
                                                |- vpn.ruyin.ai      -> 444 (web retired; node is REALITY on :443)
                                                |- sub.ruyin.ai      -> Marzban /sub/<token>
                                                |- console.ruyin.ai  -> umbra-account-web (Next.js console)
                                                |- admin.ruyin.ai    -> Marzban dashboard + umbra-account-web /invites
                                                `- pas.ruyin.ai     -> Vaultwarden
```

See [`docs/agent.md`](docs/agent.md) for the AI-maintainer document map and [`docs/design/architecture.md`](docs/design/architecture.md) for the full architecture reference.
