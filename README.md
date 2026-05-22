# Vxture Umbra

Production overseas edge entry node — SNI routing, VLESS+REALITY proxy, subscription delivery, password management, status monitoring.

**Stack:** Nginx · Xray REALITY · Marzban · PostgreSQL · Vaultwarden · Uptime Kuma · Shlink

---

## Services

| Domain | Service |
|--------|---------|
| `ruyin.ai` / `www.ruyin.ai` | Brand landing page |
| `vpn.ruyin.ai` | VPN Portal (user onboarding) |
| `sub.ruyin.ai` | Marzban subscriptions |
| `console.ruyin.ai` | Marzban admin *(VPN access only)* |
| `vault.ruyin.ai` | Vaultwarden |
| `status.ruyin.ai` | Uptime Kuma |
| `docs.ruyin.ai` | Documentation |
| `go.ruyin.ai` | Short links |

---

## Prerequisites

| Requirement | Notes |
|-------------|-------|
| Ubuntu 22.04 LTS | Tested on 2C2G / 40GB SSD |
| Docker + docker compose v2 | See install step below |
| DNS A records | All 9 domains → server IP, must resolve before cert issuance |
| Open ports | 80, 443 |

---

## Deployment

### 1. Install Docker

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker
```

### 2. Clone the repository

```bash
sudo mkdir -p /srv/vxture/repo
sudo chown $USER:$USER /srv/vxture/repo
git clone https://github.com/vxture/umbra.git /srv/vxture/repo/umbra
cd /srv/vxture/repo/umbra
```

### 3. Configure `.env`

```bash
cp .env.example .env
nano .env
```

Fill in all required values:

```bash
# Passwords — generate with: openssl rand -base64 32
MARZBAN_ADMIN_USER=admin
MARZBAN_ADMIN_PASSWORD=<strong-password>
CONSOLE_HTPASSWD_PASSWORD=<strong-password>
POSTGRES_PASSWORD=<strong-password>
POSTGRES_MARZBAN_PASSWORD=<strong-password>
POSTGRES_VAULTWARDEN_PASSWORD=<strong-password>
POSTGRES_SHLINK_PASSWORD=<strong-password>

# Admin token — generate with: openssl rand -base64 48
VAULTWARDEN_ADMIN_TOKEN=<token>

# Email for Let's Encrypt notifications
CERTBOT_EMAIL=your@email.com

# Staging test: set true first, then false after verifying
CERTBOT_STAGING=true
```

### 4. Point DNS to this server

All 9 A records must resolve to the server's public IP before continuing.
Verify with: `dig +short vpn.ruyin.ai`

### 5. Deploy

```bash
bash scripts/deploy-all.sh
```

Runs all steps in order — idempotent, safe to re-run:

| Step | Script | Action |
|------|--------|--------|
| 00 | `00-check-env.sh` | Validate env vars, Docker, DNS, ports |
| 01 | `01-init-dirs.sh` | Create data directory structure |
| 02 | `02-generate-reality.sh` | Generate REALITY x25519 keypair *(skips if exists)* |
| 03 | `03-issue-certs.sh` | Issue Let's Encrypt certs via Certbot *(skips if valid >30d)* |
| 03 | `03-self-signed.sh` | Self-signed certs for debugging without DNS *(set `CERTBOT_SKIP=true`)* |
| 04 | `04-render-configs.py` | Render all templates → `DATA_DIR` |
| 05 | `05-up.sh` | Pull images and start all containers |
| 06 | `06-verify.sh` | Verify endpoints, containers, certs, databases |
| 07 | `07-backup.sh` | Create initial backup |

### 6. Verify

```bash
bash scripts/06-verify.sh
```

Or manually:

```bash
curl -sk https://vpn.ruyin.ai | head -3
curl -sk -o /dev/null -w "%{http_code}" https://console.ruyin.ai
# Expected: 403 (VPN-only access)
```

### 7. Switch to production certificates

Once staging test passes:

```bash
# Update .env
sed -i 's/CERTBOT_STAGING=true/CERTBOT_STAGING=false/' .env

# Remove staging certs and re-issue real ones
rm -rf /srv/vxture/data/umbra/letsencrypt
bash scripts/03-issue-certs.sh
docker exec umbra-nginx nginx -s reload
```

---

## Post-deploy

### Create VPN users

Open `https://console.ruyin.ai` (requires VPN connection) → create users → distribute subscription URLs:

```
https://sub.ruyin.ai/sub/<token>
```

### Operations

```bash
# Manual backup
bash scripts/07-backup.sh

# Certificate renewal (also runs daily via cron at 03:17)
bash scripts/renew-cert.sh

# View logs
docker compose logs -f umbra-nginx
docker compose logs -f umbra-marzban

# Restart a service
docker compose restart umbra-nginx
```

---

## Migration (DNS cutover)

If migrating from an existing server:

1. Lower DNS TTL to 60s (ideally 24h in advance)
2. Deploy new server with `CERTBOT_STAGING=true`
3. Test all services
4. Update DNS → new server IP
5. Switch to production certs (step 7 above)
6. Create users in Marzban, distribute new subscription URLs

---

## Scripts

| Script | Purpose |
|--------|---------|
| `scripts/deploy-all.sh` | Full deployment orchestrator |
| `scripts/06-verify.sh` | Verify all services and endpoints |
| `scripts/07-backup.sh` | Backup databases and configs |
| `scripts/renew-cert.sh` | Certificate renewal |

## Docs

See [`docs/agent.md`](docs/agent.md) for architecture and design reference.
