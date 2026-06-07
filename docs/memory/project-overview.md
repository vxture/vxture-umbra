# Project Overview (memory mirror)

> Mirror of memory `project-overview`. Authoritative detail lives in
> [`../design/architecture.md`](../design/architecture.md),
> [`../design/decisions.md`](../design/decisions.md), and
> [`../specs/domains.md`](../specs/domains.md).

## Umbra - VPN Edge Node

**Stack:** Nginx - Xray REALITY (via Marzban) - Marzban - Vaultwarden - Uptime Kuma - Shlink

**Domains (all on ruyin.ai):**
- `ruyin.ai`, `www.ruyin.ai` - landing page (static)
- `proxy.ruyin.ai` - VPN user portal (static)
- `sub.ruyin.ai` - Marzban subscription endpoint
- `console.ruyin.ai` - Marzban admin (Docker-network IP only)
- `vault.ruyin.ai` - Vaultwarden
- `status.ruyin.ai` - Uptime Kuma
- `docs.ruyin.ai` - Static docs
- `go.ruyin.ai` - Shlink short links

> Note: the canonical domain-to-service map is in
> [`../agent.md`](../agent.md) and [`../specs/domains.md`](../specs/domains.md);
> consult those before relying on the list above.

## Architecture

```
:443 nginx stream (SNI preread)
  SNI = www.microsoft.com -> Xray REALITY at umbra-marzban:10443
  SNI = anything else      -> nginx HTTP block at :8443
    -> per-domain vhosts proxy to respective containers
```

## Key design decisions

- Marzban runs as plain HTTP on :8000 (no internal TLS). nginx terminates TLS
  and HTTP-proxies to Marzban. This avoids the self-signed cert startup catch-22.
- nginx has NO depends_on - starts independently, returns 502 until backends are up.
- Marzban embeds Xray-core; XRAY_JSON points to rendered xray_config.json in DATA_DIR.

## Paths

- Repo: `/srv/vxture/repo/umbra`
- Data: `/srv/vxture/data/umbra`
- Backup: `/srv/vxture/backup/umbra`

**Why:** Marzban was previously configured with UVICORN_SSL_CERTFILE/KEYFILE,
which caused crash-loops on self-signed certs. Removed in refactor.
