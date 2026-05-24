# Umbra — Deployment

Complete guide for deploying a fresh Umbra node.

---

## Prerequisites

### Server

```
OS:      Ubuntu 26.04 LTS
Spec:    1C1G / 25GB SSD
User:    stone (non-root, sudo + docker group)
```

### Software

```bash
# Docker Engine + Compose plugin
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker stone

# Python 3 (for render scripts)
sudo apt install -y python3 python3-pip
```

### DNS — All records must resolve before deployment

| Hostname | Type | Target |
|----------|------|--------|
| `ruyin.ai` | A | server public IP |
| `www.ruyin.ai` | A | server public IP |
| `vpn.ruyin.ai` | A | server public IP |
| `sub.ruyin.ai` | A | server public IP |
| `console.ruyin.ai` | A | server public IP |
| `pass.ruyin.ai` | A | server public IP |
| `vault.ruyin.ai` | A | server public IP |

Verify all resolve before running `deploy-all.sh`:

```bash
for d in ruyin.ai www.ruyin.ai vpn.ruyin.ai sub.ruyin.ai console.ruyin.ai pass.ruyin.ai vault.ruyin.ai; do
  echo "$d → $(dig +short $d)"
done
```

---

## Environment Configuration

### Step 1: Clone and copy env

```bash
cd /srv/vxture/repo
git clone https://github.com/vxture/umbra.git
cd umbra
cp .env.example .env
```

### Step 2: Edit `.env`

```env
# ── Node Identity ──────────────────────────────────────
PROJECT_NAME=umbra
NODE_NAME=vx-tokyo

# ── Domains ────────────────────────────────────────────
APEX_DOMAIN=ruyin.ai
WWW_DOMAIN=www.ruyin.ai
EDGE_DOMAIN=vpn.ruyin.ai
SUB_DOMAIN=sub.ruyin.ai
CONSOLE_DOMAIN=console.ruyin.ai
PASS_DOMAIN=pass.ruyin.ai
VAULT_DOMAIN=vault.ruyin.ai

# ── Paths ───────────────────────────────────────────────
ROOT_DIR=/srv/vxture
REPO_DIR=/srv/vxture/repo/umbra
DATA_DIR=/srv/vxture/data/umbra
BACKUP_DIR=/srv/vxture/backup/umbra

# ── Nginx ───────────────────────────────────────────────
NGINX_CONTAINER=umbra-nginx

# ── Xray / REALITY ─────────────────────────────────────
REALITY_DEST=www.microsoft.com:443
REALITY_SNI=www.microsoft.com
REALITY_SHORT_ID_LENGTH=16
XRAY_INTERNAL_PORT=10443

# ── Marzban ─────────────────────────────────────────────
MARZBAN_ADMIN_USER=<admin-username>
MARZBAN_ADMIN_PASSWORD=<strong-password>
CONSOLE_HTPASSWD_PASSWORD=<strong-password>   # Nginx Basic Auth for console.ruyin.ai
SUBSCRIPTION_URL_PREFIX=https://sub.ruyin.ai

# ── Vaultwarden ─────────────────────────────────────────
VAULTWARDEN_ADMIN_TOKEN=<generate-with: openssl rand -base64 48>

# ── Certbot ─────────────────────────────────────────────
CERTBOT_EMAIL=<your-email>

```

### Step 3: Secrets

No database passwords needed — SQLite requires no credentials. The only secret file is `DATA_DIR/private/reality.json`, which is generated automatically by `02-generate-reality.sh`.

---

## Deploy Script Order

### One-shot deploy

```bash
bash scripts/deploy-all.sh
```

### Step-by-step

```
00-check-env.sh        Validate environment, DNS, Docker
01-init-dirs.sh        Create DATA_DIR structure with correct permissions
02-generate-reality.sh Generate REALITY keypair → private/reality.json
03-issue-certs.sh      Issue Let's Encrypt certs for all 7 domains
04-render-configs.py   Render all templates → DATA_DIR
05-up.sh               docker compose up -d
06-verify.sh           Full verification suite
07-backup.sh           Create timestamped backup archive
```

---

## Script Specifications

### `00-check-env.sh`

```
Checks:
  [ ] .env exists and is not .env.example
  [ ] All required vars are set
  [ ] Docker is available
  [ ] docker compose v2 is available
  [ ] stone user is in docker group
  [ ] All 7 domains resolve to this server's public IP
  [ ] Ports 80 and 443 are not in use
```

### `01-init-dirs.sh`

Creates:

```
DATA_DIR/nginx/conf.d
DATA_DIR/nginx/stream.d
DATA_DIR/nginx/html/ruyin-landing
DATA_DIR/nginx/html/www-ruyin
DATA_DIR/nginx/logs
DATA_DIR/marzban/templates/clash
DATA_DIR/vaultwarden/data
DATA_DIR/portal/html
DATA_DIR/letsencrypt
DATA_DIR/certbot
DATA_DIR/private
BACKUP_DIR
```

Permissions:

```bash
chmod 700 DATA_DIR/private
chmod 700 BACKUP_DIR
```

### `02-generate-reality.sh`

- Runs `xray x25519` via a temporary Docker container (`teddysun/xray`)
- Generates private key, public key, shortId
- Writes `DATA_DIR/private/reality.json` (chmod 600)
- **Skips if file already exists**

### `03-issue-certs.sh`

- Starts a temporary Nginx container serving ACME challenge on port 80
- Issues cert for each domain sequentially
- All certs stored in `DATA_DIR/letsencrypt/`
- Verifies each cert was issued before proceeding

### `04-render-configs.py`

Renders all templates with variables from `.env` and `private/`:

Run this step with Python, or via the deployment dispatcher:

```bash
python3 scripts/steps/04-render-configs.py
# or
bash scripts/deploy.sh config
```

Do not run it with `bash scripts/steps/04-render-configs.py`; it is a Python script.

| Source | Output |
|--------|--------|
| `configs/nginx/stream.conf.template` | `DATA_DIR/nginx/stream.d/stream.conf` |
| `configs/nginx/vhosts/*.conf.template` (×8: 7 domain vhosts + 1 catch-all) | `DATA_DIR/nginx/conf.d/*.conf` |
| `configs/marzban/clash-subscription.j2` | `DATA_DIR/marzban/templates/clash/default.yml` |

Also injects REALITY public key and short ID into Marzban startup config.

### `05-up.sh`

```bash
docker compose up -d
```

Waits for each service to report healthy before proceeding.

### `06-verify.sh`

See Verification Checklist below.

### `07-backup.sh`

See `operations.md`.

---

## Verification Checklist

### Container Status

```bash
docker compose ps
```

Expected: all containers in `running` state.

### HTTPS Check (all domains)

```bash
for d in ruyin.ai www.ruyin.ai vpn.ruyin.ai sub.ruyin.ai pass.ruyin.ai vault.ruyin.ai; do
  code=$(curl -sk -o /dev/null -w "%{http_code}" https://$d)
  echo "$d → $code"
done
```

Expected: all return 200 or 301/302 (no 502, no cert errors).

### vpn-admin Blocked from Public

```bash
# From a random IP (not connected to VPN)
curl -sk -o /dev/null -w "%{http_code}" https://console.ruyin.ai
```

Expected: `403`

### Xray Port

```bash
timeout 5 bash -c "</dev/tcp/vpn.ruyin.ai/443" && echo "443 open" || echo "443 closed"
```

Expected: `443 open`

### Marzban Admin

```bash
curl -sk -o /dev/null -w "%{http_code}" \
  -H "X-Forwarded-For: 172.20.0.1"  # simulate Docker internal IP \
  https://console.ruyin.ai/dashboard
```

Expected: `200`

### Subscription Format

Create a test user in Marzban, then:

```bash
curl -sk https://sub.ruyin.ai/sub/<marzban-token> | grep -E "name: vx-tokyo|MATCH,PROXY|openai"
```

Expected output contains:
```
name: vx-tokyo
DOMAIN-SUFFIX,openai.com,PROXY
MATCH,PROXY
```

Must NOT contain:
```
DOMAIN-SUFFIX,microsoft.com,PROXY
```

Use GET for subscription tests. `curl -I` sends HEAD and Marzban returns `405 Method Not Allowed` with `allow: GET`; that is not a subscription failure.

The subscription host should expose only native Marzban `/sub/<marzban-token>` URLs:

```bash
curl -sk -o /dev/null -w "%{http_code}\n" https://sub.ruyin.ai/
curl -sk -o /dev/null -w "%{http_code}\n" https://sub.ruyin.ai/sub
curl -sk -o /dev/null -w "%{http_code}\n" https://sub.ruyin.ai/sub/
curl -sk -o /dev/null -w "%{http_code}\n" https://sub.ruyin.ai/sub/TESTTOKEN/clash-meta
```

Expected: all four return `404`. A real `GET https://sub.ruyin.ai/sub/<marzban-token>` should return `200`.

Marzban console may display a different subscription token after each refresh. That is expected; saved tokens can remain valid. Verify old and new URLs with GET and status `200` before replacing distributed links.

### SQLite Databases

```bash
ls -la /srv/vxture/data/umbra/marzban/db.sqlite3
ls -la /srv/vxture/data/umbra/vaultwarden/data/db.sqlite3
```

Expected: both files exist and are non-zero size.

---

## Migration: New Node from Scratch

### Prerequisites

- New VPS provisioned with same OS
- DNS records already point to new server

### Steps

```
1.  Provision new VPS (Ubuntu 22.04)
2.  Install Docker + Compose on new VPS
3.  Create user stone, add to docker group
4.  Clone vxture/umbra to /srv/vxture/repo/umbra
5.  Copy .env from old node
6.  Copy DATA_DIR/private/ from old node
    (preserves REALITY keys — clients keep same public key)
7.  Run deploy-all on new VPS
8.  Verify using /etc/hosts override (point domains to new IP locally)
9.  Switch DNS to new VPS IP
10. Notify users to refresh subscription in Clash
11. Monitor 24–72 hours
12. Run final backup on old node
13. Destroy old VPS
```

Copying `private/reality.json` ensures existing Marzban users keep the same REALITY public key — no client reconfiguration needed, only a subscription refresh.

---

## Parallel Run (New and Old Node Simultaneous)

During migration, run both nodes simultaneously:

```
Old node: worker-03 → vpn.ruyin.ai (current DNS)
New node: edge-01   → vpn-test.ruyin.ai (test DNS only)
```

Test new node via `vpn-test.ruyin.ai` before touching production DNS.
Only cut production DNS after new node passes full verification.
