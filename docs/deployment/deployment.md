# Umbra - Deployment

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

### DNS - All records must resolve before deployment

| Hostname | Type | Target |
|----------|------|--------|
| `ruyin.ai` | A | server public IP |
| `www.ruyin.ai` | A | server public IP |
| `vpn.ruyin.ai` | A | server public IP |
| `sub.ruyin.ai` | A | server public IP |
| `console.ruyin.ai` | A | server public IP |
| `admin.ruyin.ai` | A | server public IP |
| `pass.ruyin.ai` | A | server public IP |

Verify all resolve before running `deploy.sh all`:

```bash
for d in ruyin.ai www.ruyin.ai vpn.ruyin.ai sub.ruyin.ai console.ruyin.ai admin.ruyin.ai pass.ruyin.ai; do
  echo "$d -> $(dig +short $d)"
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
# -- Node Identity --------------------------------------
PROJECT_NAME=umbra
NODE_NAME=vx-tokyo

# -- Domains --------------------------------------------
APEX_DOMAIN=ruyin.ai
WWW_DOMAIN=www.ruyin.ai
EDGE_DOMAIN=vpn.ruyin.ai
SUB_DOMAIN=sub.ruyin.ai
CONSOLE_DOMAIN=console.ruyin.ai
ADMIN_DOMAIN=admin.ruyin.ai
PASS_DOMAIN=pass.ruyin.ai

# -- Paths -----------------------------------------------
ROOT_DIR=/srv/vxture
REPO_DIR=/srv/vxture/repo/umbra
DATA_DIR=/srv/vxture/data/umbra
BACKUP_DIR=/srv/vxture/backup/umbra

# -- Nginx -----------------------------------------------
NGINX_CONTAINER=umbra-nginx

# -- Private packages ------------------------------------
VXTURE_NPM_REGISTRY=https://npm.pkg.github.com
NODE_AUTH_TOKEN=<token-with-package-read-access>

# -- Xray / REALITY -------------------------------------
REALITY_DEST=www.microsoft.com:443
REALITY_SNI=www.microsoft.com
REALITY_SHORT_ID_LENGTH=16
XRAY_INTERNAL_PORT=10443

# -- Marzban ---------------------------------------------
MARZBAN_ADMIN_USER=<admin-username>
MARZBAN_ADMIN_PASSWORD=<strong-password>
SUBSCRIPTION_URL_PREFIX=https://sub.ruyin.ai

# -- Account portal --------------------------------------
ACCOUNT_SESSION_SECRET=<generate-with: openssl rand -base64 48>
ACCOUNT_INVITE_SECRET=<generate-with: openssl rand -base64 48>
ACCOUNT_INVITE_TTL_DAYS=30

# -- Vaultwarden -----------------------------------------
VAULTWARDEN_ADMIN_TOKEN=<generate-with: openssl rand -base64 48>

# -- Certbot ---------------------------------------------
CERTBOT_EMAIL=<your-email>

```

### Step 3: Secrets

No database passwords needed - SQLite requires no credentials. The account portal secrets sign sessions and hash invite codes; generate them separately. The REALITY secret file is `DATA_DIR/private/reality.json`, which is generated automatically by [`13-generate-runtime-secrets.sh`](../../deploy/scripts/13-generate-runtime-secrets.sh).

---

## Deploy Script Order

### One-shot deploy

```bash
bash deploy/deploy.sh all
```

### Step-by-step

```
11-check-runtime-environment.sh                Validate environment, DNS, Docker
12-prepare-runtime-directories.sh            Create DATA_DIR structure with correct permissions
13-generate-runtime-secrets.sh            Generate REALITY keypair -> private/reality.json
20-issue-tls-certificates.sh           Issue Let's Encrypt certs for active domains
22-render-runtime-configs.py   Render all templates -> DATA_DIR
23-start-docker-services.sh            docker compose up -d
24-verify-deployment.sh                Full verification suite
25-run-post-deploy-wizard.sh               Interactive wizard (host config, user creation, sub URLs)
```

`deploy.sh all` also calls `ops.sh backup` at the end unless `--skip-backup` is passed.

---

## Script Specifications

### `11-check-runtime-environment.sh`

```
Checks:
  [ ] .env exists and is not .env.example
  [ ] All required vars are set
  [ ] Docker is available
  [ ] docker compose v2 is available
  [ ] stone user is in docker group
  [ ] Active domains resolve to this server's public IP
  [ ] Ports 80 and 443 are not in use
```

### `12-prepare-runtime-directories.sh`

Creates:

```
DATA_DIR/nginx/conf.d
DATA_DIR/nginx/stream.d
DATA_DIR/nginx/snippets
DATA_DIR/nginx/private
DATA_DIR/nginx/logs
DATA_DIR/marzban/templates/clash
DATA_DIR/marzban/templates/v2ray
DATA_DIR/marzban/logs
DATA_DIR/vaultwarden/data
DATA_DIR/letsencrypt
DATA_DIR/certbot/www/.well-known/acme-challenge
DATA_DIR/certbot/config
DATA_DIR/certbot/hooks
DATA_DIR/private
BACKUP_DIR
```

Permissions:

```bash
chmod 700 DATA_DIR/private
chmod 711 DATA_DIR/nginx/private
chmod 700 BACKUP_DIR
```

### `13-generate-runtime-secrets.sh`

- Runs `xray x25519` via a temporary Docker container (`teddysun/xray`)
- Generates private key, public key, shortId
- Writes `DATA_DIR/private/reality.json` (chmod 600)
- **Skips if file already exists**

### `20-issue-tls-certificates.sh`

- Starts a temporary Nginx container serving ACME challenge on port 80
- Issues cert for each domain sequentially
- Certs are stored in `DATA_DIR/letsencrypt/` by default
- `CERTBOT_CERT_DIR` can override the destination for staged issuance
- Refuses in-place replacement when a non-trusted cert directory already exists
- Reuses existing trusted LE certs that are not near expiry
- Verifies each cert was issued and trusted before proceeding
- Removes invalid zero-byte renewal configs left by failed certbot attempts
- When used by `certs --upgrade`, partial staged successes are kept for the next retry
- Activation is blocked unless every staged domain verifies as trusted, unexpired, name-matched LE

### `22-render-runtime-configs.py`

Renders all templates with variables from `.env` and `private/`:

Run this step with Python, or via the deployment dispatcher:

```bash
python3 deploy/scripts/22-render-runtime-configs.py
# or
bash deploy/deploy.sh config
```

Do not run it with `bash deploy/scripts/22-render-runtime-configs.py`; it is a Python script.

| Source | Output |
|--------|--------|
| `configs/nginx/nginx.conf` | `DATA_DIR/nginx/nginx.conf` |
| `configs/nginx/stream.conf.template` | `DATA_DIR/nginx/stream.d/stream.conf` |
| `configs/nginx/vhosts/*.conf.template` (8 templates: 7 domain vhosts + 1 catch-all) | `DATA_DIR/nginx/conf.d/*.conf` |
| `configs/nginx/snippets/*.conf` | `DATA_DIR/nginx/snippets/*.conf` |
| `configs/marzban/clash-subscription.j2` | `DATA_DIR/marzban/templates/clash/default.yml` |
| `configs/xray/config.json.template` | `DATA_DIR/marzban/xray_config.json` |

Also injects REALITY keys into Xray/Marzban config and renders the Clash subscription template.
The Ruyin public website is built as the `umbra-website` Next.js service and
served through `01-ruyin.conf.template`; it is not copied into `DATA_DIR`.

### `23-start-docker-services.sh`

```bash
docker compose up -d
```

Polls each service for healthy status before proceeding (replaces a hard sleep with health check retries).

### `24-verify-deployment.sh`

See Verification Checklist below.

---

## Verification Checklist

### Container Status

```bash
docker compose ps
```

Expected: all containers in `running` state.

### HTTPS Check (all domains)

```bash
for d in ruyin.ai www.ruyin.ai vpn.ruyin.ai sub.ruyin.ai console.ruyin.ai admin.ruyin.ai pass.ruyin.ai; do
  code=$(curl -sk -o /dev/null -w "%{http_code}" https://$d)
  echo "$d -> $code"
done
```

Expected: all return 200 or 301/302 (no 502, no cert errors).

### Marzban Console Login

```bash
curl -sk -o /dev/null -w "%{http_code}" https://admin.ruyin.ai/dashboard/
```

Expected: `200`, `301`, `302`, `307`, `308`, or `401`; not `403`.

### Xray Port

```bash
timeout 5 bash -c "</dev/tcp/vpn.ruyin.ai/443" && echo "443 open" || echo "443 closed"
```

Expected: `443 open`

### Marzban Admin

```bash
curl -sk -o /dev/null -w "%{http_code}" \
  https://admin.ruyin.ai/dashboard
```

Expected: the Marzban login/dashboard route responds; nginx must not block it with `403`.

### Subscription Format

Create a test user in Marzban, then:

```bash
curl -sk https://sub.ruyin.ai/sub/<marzban-token> | grep -E "name: vx-tokyo|MATCH,PROXY|openai|microsoft.com,DIRECT|cloudflare.com,PROXY|vultr.com,DIRECT|108.61.182.248/32,DIRECT"
```

Expected output contains:
```
name: vx-tokyo
DOMAIN-SUFFIX,microsoft.com,DIRECT
DOMAIN-SUFFIX,cloudflare.com,PROXY
DOMAIN-SUFFIX,vultr.com,DIRECT
IP-CIDR,108.61.182.248/32,DIRECT,no-resolve
DOMAIN-SUFFIX,openai.com,PROXY
MATCH,PROXY
```

The config renderer runs `deploy/scripts/19-check-clash-rules.py` and fails if any must-direct domain from `configs/marzban/must-direct-rules.txt` is missing, appears after the proxy boundary, or overlaps a `PROXY` rule.

Must NOT contain:
```
DOMAIN-SUFFIX,microsoft.com,PROXY
DOMAIN-SUFFIX,vultr.com,PROXY
IP-CIDR,108.61.182.248/32,PROXY
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
ls -la /srv/vxture/data/umbra/account/account.db
ls -la /srv/vxture/data/umbra/vaultwarden/data/db.sqlite3
```

Expected: all files exist and are non-zero size after services have started.

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
    (preserves REALITY keys - clients keep same public key)
7.  Run `bash deploy/deploy.sh all` on new VPS
8.  Verify using /etc/hosts override (point domains to new IP locally)
9.  Switch DNS to new VPS IP
10. Notify users to refresh subscription in Clash
11. Monitor 24-72 hours
12. Run final backup on old node
13. Destroy old VPS
```

Copying `private/reality.json` ensures existing Marzban users keep the same REALITY public key - no client reconfiguration needed, only a subscription refresh.

---

## Parallel Run (New and Old Node Simultaneous)

During migration, run both nodes simultaneously:

```
Old node: production -> vpn.ruyin.ai (current DNS)
New node: edge-01   -> vpn-test.ruyin.ai (test DNS only)
```

Test new node via `vpn-test.ruyin.ai` before touching production DNS.
Only cut production DNS after new node passes full verification.
