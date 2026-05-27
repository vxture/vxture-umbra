# Umbra - Operations

Ongoing maintenance for a live Umbra edge node.

---

## Backup

### Automated Backup

Runs automatically:
- After every successful `deploy.sh all`
- Daily via cron at 02:00

```cron
0 2 * * * /srv/vxture/repo/umbra/scripts/ops.sh backup >> /var/log/umbra-backup.log 2>&1
```

### What Gets Backed Up

```bash
# Config files
REPO_DIR/.env
DATA_DIR/nginx/conf.d/
DATA_DIR/nginx/stream.d/
DATA_DIR/marzban/templates/
DATA_DIR/private/               <- REALITY keys

# SQLite database copies
DATA_DIR/marzban/db.sqlite3        -> backup/marzban-db-<ts>.sqlite3
DATA_DIR/vaultwarden/data/         -> backup/vaultwarden-data-<ts>.tar.gz  (full dir: DB + attachments + sends)

# Certs
DATA_DIR/letsencrypt/

# System state
crontab -l -> backup/root-crontab-<ts>.txt
```

### Backup Output

```
BACKUP_DIR/umbra-config-<YYYYMMDD-HHMMSS>.tar.gz        permissions: 600
BACKUP_DIR/env-<YYYYMMDD-HHMMSS>.txt                    permissions: 600
BACKUP_DIR/marzban-db-<YYYYMMDD-HHMMSS>.sqlite3         permissions: 600
BACKUP_DIR/vaultwarden-data-<YYYYMMDD-HHMMSS>.tar.gz    permissions: 600
BACKUP_DIR/letsencrypt-state-<YYYYMMDD-HHMMSS>.tar.gz   permissions: 600
BACKUP_DIR/root-crontab-<YYYYMMDD-HHMMSS>.txt           permissions: 600
BACKUP_DIR/                                               permissions: 700
```

### Backup Retention

```bash
# Keep last 30 days, delete older
find BACKUP_DIR/ -name "*.tar.gz" -mtime +30 -delete
find BACKUP_DIR/ -name "*.sql.gz" -mtime +30 -delete
```

Add to cron (runs after backup):

```cron
30 2 * * * find /srv/vxture/backup/umbra -mtime +30 -delete
```

---

## Rollback

### Full Rollback from Backup

```bash
# 1. Stop services
docker compose down

# 2. Restore config files
cp BACKUP_DIR/env-<timestamp>.txt REPO_DIR/.env
chmod 600 REPO_DIR/.env
tar -xzf BACKUP_DIR/umbra-config-<timestamp>.tar.gz -C DATA_DIR/
tar -xzf BACKUP_DIR/letsencrypt-state-<timestamp>.tar.gz -C DATA_DIR/

# 3. Restore SQLite databases
cp BACKUP_DIR/marzban-db-<timestamp>.sqlite3 DATA_DIR/marzban/db.sqlite3

# Vaultwarden - full data dir (DB + attachments + sends)
tar -xzf BACKUP_DIR/vaultwarden-data-<timestamp>.tar.gz -C DATA_DIR/vaultwarden/

# 4. Restore crontab
crontab BACKUP_DIR/root-crontab-<timestamp>.txt

# 5. Start all services
docker compose up -d

# 6. Verify
bash scripts/deploy.sh verify
```

---

## Certificate Management

### Renewal Script

```bash
bash scripts/ops.sh certs --renew
```

What it does:

```bash
certbot renew --cert-name <active-domain> --quiet --webroot --webroot-path DATA_DIR/certbot
```

The script loops over the active domains from `.env` only. Retired or leftover Certbot lineages under `DATA_DIR/letsencrypt/renewal/` are not renewed by cron.

If certbot does not renew any active certificate, services are left untouched. If a renewal happens, the script syncs the edge cert into `DATA_DIR/marzban/tls`, reloads nginx after a config test, and restarts Marzban so it reopens the TLS files.

Before running `certbot renew`, the script removes only invalid zero-byte files under `DATA_DIR/letsencrypt/renewal/`. This cleanup does not issue certificates and does not remove certificate material.

### Cron

```cron
17 3 * * * /srv/vxture/repo/umbra/scripts/ops.sh certs --renew >> /var/log/umbra-cert-renew.log 2>&1
```

### Manual Cert Check

```bash
bash scripts/ops.sh certs --status
```

The status command reads certificates inside Docker because certbot-owned files may not be readable by the deploy user on the host.

It reports non-trusted/self-signed issuers as warnings and also warns if zero-byte renewal configs exist.

### Renewal State Cleanup

```bash
bash scripts/ops.sh certs --clean-renewal-state
```

This removes only zero-byte `DATA_DIR/letsencrypt/renewal/*.conf` files left by failed or interrupted certbot runs. It does not contact Let's Encrypt, does not renew certificates, and does not delete `live/` or `archive/` certificate files.

### Retired Certificate Lineage Cleanup

```bash
bash scripts/ops.sh certs --clean-retired-lineages
```

This removes Certbot lineages that are not active in `.env`. It deletes only matching non-active entries under `DATA_DIR/letsencrypt/live/`, `DATA_DIR/letsencrypt/archive/`, and `DATA_DIR/letsencrypt/renewal/*.conf`.

It preserves active domains, Certbot accounts, renewal hooks, `DATA_DIR/letsencrypt.backup.*`, and certificate workdirs.

### Certificate Workdir Cleanup

```bash
bash scripts/ops.sh certs --clean-workdirs
```

This normalizes retry directories. If no `DATA_DIR/letsencrypt.staged` exists, it migrates the newest legacy `DATA_DIR/letsencrypt.new.*` directory into `DATA_DIR/letsencrypt.staged`, then removes obsolete `letsencrypt.new.*` and `letsencrypt.failed.*` workdirs. It does not delete active `DATA_DIR/letsencrypt` or `letsencrypt.backup.*` rollback directories.

### Real Certificate Upgrade

```bash
bash scripts/ops.sh certs --upgrade
```

Upgrade is staged:

1. Legacy staged workdirs are normalized before issuance.
2. Current certificates are copied into `DATA_DIR/letsencrypt.staged`, or an existing staged directory is reused from a prior retry.
3. Valid existing LE certs are reused; non-trusted domain state is removed only from the staged copy.
4. Missing, expiring, or non-trusted certs are issued inside the staged directory.
5. Existing production certificates stay in `DATA_DIR/letsencrypt` while issuance runs.
6. If any domain fails or Let's Encrypt rate-limits the request, the staged directory is kept and the running system keeps the old certificates. This preserves any newly issued staged certs for the next retry.
7. Before activation, every staged domain is independently verified as a trusted, unexpired, name-matched LE certificate.
8. Only after every domain succeeds does the script move the old directory to `DATA_DIR/letsencrypt.backup.<timestamp>` and activate the staged directory.
9. If TLS sync or service restart fails after activation, the script attempts to restore the backup and saves the failed new directory as `DATA_DIR/letsencrypt.failed.<timestamp>`.

The upgrade domain set is the active public domain list from `.env`.

### Wildcard Cert (Future Option)

If managing 9 separate certs becomes burdensome, migrate to wildcard:

```bash
certbot certonly --dns-cloudflare \
  --dns-cloudflare-credentials /srv/vxture/data/umbra/private/cloudflare.ini \
  -d "ruyin.ai" -d "*.ruyin.ai"
```

Requires Cloudflare API token. Consider in v1.1.

---

## Marzban User Management

### Access

Marzban console: `https://console.ruyin.ai`
The console is public at nginx and protected by Marzban's own login. A `403` from nginx means stale rendered config still contains an old network restriction.

### Common Operations (via Marzban UI or API)

| Operation | UI Path | API |
|-----------|---------|-----|
| Add user | Users -> Add User | `POST /api/user` |
| View subscription URL | Users -> click user | `GET /api/user/{username}/subscription` |
| Reset traffic | Users -> Reset Traffic | `POST /api/user/{username}/reset` |
| Disable user | Users -> Edit -> disable | `PUT /api/user/{username}` |
| Delete user | Users -> Delete | `DELETE /api/user/{username}` |
| View traffic stats | Dashboard | `GET /api/users` |

### Subscription URL Format

```
https://sub.ruyin.ai/sub/<marzban-token>
```

Users configure this URL in Clash Verge / V2RayN once. Refreshing the subscription gets the latest config including any node updates.

Marzban may show a different `/sub/<marzban-token>` value after each console page refresh. This is expected: tokens are generated dynamically for the same user, and older tokens can remain valid. Use a GET request to verify a saved subscription URL:

```bash
curl -sk -o /tmp/sub.yaml -w "%{http_code}\n" 'https://sub.ruyin.ai/sub/<marzban-token>'
head -30 /tmp/sub.yaml
```

Expected status: `200`. Do not use `curl -I` for this endpoint; Marzban rejects HEAD requests with `405 Method Not Allowed` and `allow: GET`.

The subscription domain is intentionally path-restricted by nginx:

```bash
curl -sk -o /dev/null -w "%{http_code}\n" https://sub.ruyin.ai/
curl -sk -o /dev/null -w "%{http_code}\n" https://sub.ruyin.ai/sub
curl -sk -o /dev/null -w "%{http_code}\n" https://sub.ruyin.ai/sub/
curl -sk -o /dev/null -w "%{http_code}\n" https://sub.ruyin.ai/sub/TESTTOKEN/clash-meta
```

Expected status for all four: `404`. Only native Marzban `GET /sub/<marzban-token>` is public.

### Adding a New Node (Multi-node, v1.1+)

Marzban supports connecting multiple Xray nodes. Future edge nodes (edge-02, etc.) can be added via:
- Marzban admin -> Nodes -> Add Node
- Install `marzban-node` on the new server
- Connect via API cert

---

## Service Management

### Restart individual service

```bash
docker compose restart umbra-nginx
docker compose restart umbra-marzban
docker compose restart umbra-vaultwarden
```

### Reload Nginx config (no downtime)

```bash
docker exec umbra-nginx nginx -s reload
```

### Check logs

```bash
docker compose logs umbra-nginx --tail=100
docker compose logs umbra-marzban --tail=100
docker compose logs umbra-vaultwarden --tail=50
```

### Full restart

```bash
docker compose down && docker compose up -d
```

---

## Log Management

### Log Locations

```
DATA_DIR/nginx/logs/access.log
DATA_DIR/nginx/logs/error.log
DATA_DIR/marzban/logs/access.log
DATA_DIR/marzban/logs/error.log
/var/log/umbra-backup.log
/var/log/umbra-cert-renew.log
```

### Logrotate Config

```
/srv/vxture/data/umbra/nginx/logs/*.log
/srv/vxture/data/umbra/marzban/logs/*.log {
    daily
    rotate 14
    compress
    delaycompress
    missingok
    notifempty
    sharedscripts
    postrotate
        docker exec umbra-nginx nginx -s reopen 2>/dev/null || true
    endscript
}
```

Place at `/etc/logrotate.d/umbra`.

---

## Monitoring

External uptime monitoring (free tier sufficient):
- **BetterStack** or **UptimeRobot** - monitors from outside the node
- Covers full-node outages that self-hosted solutions cannot detect

Recommended monitors:
- TCP `vpn.ruyin.ai:443` - VPN port (primary health signal)
- HTTPS `https://ruyin.ai` - portal
- HTTPS `https://sub.ruyin.ai` - subscription endpoint

---

## Node Decommission

```
1. Deploy new node, verify fully
2. Switch DNS to new node
3. Wait 24-72h for clients to refresh
4. Run final backup on old node
5. Download backup to safe storage
6. Verify backup integrity: tar -tzf <archive>
7. Confirm no significant traffic on old node
8. Destroy old VPS
```
