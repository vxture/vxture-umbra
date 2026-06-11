# Umbra - Architecture

---

## Traffic Flow

### Public Entry

```
Internet
|-- :80  -> umbra-nginx HTTP
|          |-- /.well-known/acme-challenge/ -> DATA_DIR/certbot/www
|          `-- everything else -> HTTPS redirect or default response
`-- :443 -> umbra-nginx stream listener with SNI preread
           |-- SNI = REALITY_SNI -> umbra-marzban:10443 (Xray subprocess)
           `-- other SNI values -> umbra-nginx internal HTTPS listener :8443
                                      |-- ruyin.ai         -> umbra-website:3210
                                      |-- www.ruyin.ai     -> 301 redirect to ruyin.ai
                                      |-- EDGE_DOMAIN      -> 444 (web retired; node is REALITY on :443)
                                      |-- sub.ruyin.ai           -> umbra-subproxy:8080 -> umbra-marzban:8000 /sub/<token>
                                      |-- console.ruyin.ai -> umbra-account-web + umbra-account API
                                      |-- admin.ruyin.ai   -> umbra-marzban:8000 and /invites -> account web/API
                                      `-- pass.ruyin.ai    -> umbra-vaultwarden:80
```

### REALITY Proxy Path

```
Client
`-- VLESS+REALITY -> EDGE_DOMAIN:443 (SNI: REALITY_SNI)
                    `-- umbra-nginx stream
                        `-- umbra-marzban:10443 (Xray subprocess)
                            `-- outbound freedom/direct
```

### Subscription Path

```
Clash client
`-- HTTPS GET sub.ruyin.ai/sub/<token>
    `-- umbra-nginx HTTP vhost
        `-- umbra-subproxy:8080
            `-- umbra-marzban:8000
                `-- Marzban renders DATA_DIR/marzban/templates/clash/default.yml
```

---

## SNI Routing Detail

Nginx operates in two modes simultaneously:

```
Mode 1: stream (layer 4, public port 443)
  - Reads SNI via ssl_preread without terminating TLS
  - Routes REALITY_SNI to umbra-marzban:10443
  - Routes all other SNI values to the internal HTTPS listener on :8443

Mode 2: http (layer 7, internal port 8443)
  - Terminates TLS for normal domains
  - Routes by server_name to container upstreams or redirects (unknown hosts -> 444)
```

Why two-level? Because:
- REALITY requires passing raw TLS to Xray without Nginx terminating it.
- Normal HTTPS domains need Nginx to terminate TLS and proxy HTTP.
- One public 443 listener can branch both paths by SNI.

---

## Container Topology

```
Docker network: umbra-net

Host ports:
  80  -> umbra-nginx
  443 -> umbra-nginx stream

Only these host ports are exposed in production. Service ports such as `3210`,
`3220`, and `3281` are internal Docker-network ports. They may be used directly
only during local development.

Services:
  umbra-nginx
    - public HTTP/HTTPS/SNI gateway
    - internal HTTPS virtual hosts on :8443
    - proxies REALITY traffic to umbra-marzban:10443
    - proxies Marzban web/API traffic to umbra-marzban:8000
    - proxies subscription traffic to umbra-subproxy:8080

  umbra-website
    - Ruyin public Next website on :3210
    - consumes Vxture design-system as the design source

  umbra-marzban
    - Marzban API/admin/subscription on :8000
    - bundled Xray subprocess on :10443

  umbra-subproxy
    - internal-only metadata normalizer for /sub/<token>

  umbra-account
    - current lightweight account/invite API (BFF) on :3281
    - stores account and invite state in DATA_DIR/account/account.db
    - talks to Marzban API and native subscription info endpoints

  umbra-account-web
    - Ruyin console UI (Next.js) on :3220
    - serves console.ruyin.ai and admin.ruyin.ai/invites
    - calls the umbra-account API for auth and invite state

  umbra-admin
    - future dedicated platform-management surface on :3230
    - image built and published; not yet wired into nginx routing

  umbra-vaultwarden
    - Vaultwarden on :80
```

---
## Server Directory Structure

The Git repo is cloned on the server, but the server is a thin runtime: it pulls
prebuilt images from the registry (GHCR / Aliyun ACR) and does NOT build portal
images locally. The checkout exists mainly for orchestration - `docker-compose.yml`,
`configs/` templates, and the `deploy/worker-03/` scripts that render runtime
config and manage the lifecycle. The `portals/` source rides along in the
checkout but is built in CI, not on the server.

```
/srv/vxture/
|-- repo/
|   `-- umbra/                         # Git repo (orchestration + config + scripts)
|       |-- docker-compose.yml
|       |-- .env.example
|       |-- brand/                     # Canonical brand identity PNG/ICO (single source)
|       |-- configs/
|       |   |-- nginx/
|       |   |   |-- nginx.conf
|       |   |   |-- stream.conf.template
|       |   |   |-- snippets/
|       |   |   |   |-- proxy-headers.conf
|       |   |   |   |-- security-headers.conf
|       |   |   |   `-- ssl-params.conf
|       |   |   `-- vhosts/
|       |   |       |-- 00-default.conf.template
|       |   |       |-- 01-ruyin.conf.template
|       |   |       |-- 02-www.conf.template
|       |   |       |-- 03-vpn.conf.template
|       |   |       |-- 04-sub.conf.template
|       |   |       |-- 05-console.conf.template
|       |   |       |-- 06-pass.conf.template
|       |   |       `-- 07-admin.conf.template
|       |   |-- xray/
|       |   |   `-- config.json.template
|       |   `-- marzban/
|       |       |-- clash-subscription.j2
|       |       `-- must-direct-rules.txt
|       |-- docker/                    # Dockerfiles for CI-built images
|       |   |-- ruyin-account-api.Dockerfile
|       |   |-- ruyin-nginx.Dockerfile
|       |   `-- ruyin-subproxy.Dockerfile
|       |-- portals/                   # Next.js source; images built in CI, not here
|       |   |-- website/               # app/, components/, lib/, public/, Dockerfile
|       |   |-- console/               # app/, public/, Dockerfile
|       |   `-- admin/                 # app/, public/, Dockerfile
|       |-- services/                  # Ruyin-owned Python edge services
|       |   |-- account/account.py
|       |   `-- subproxy/subproxy.py
|       |-- deploy/
|       |   `-- worker-03/             # Server-side deploy/ops entrypoints
|       |       |-- server.sh
|       |       |-- deploy.sh
|       |       |-- ops.sh
|       |       |-- lib/
|       |       |   |-- 00-log.sh
|       |       |   |-- 01-env.sh
|       |       |   `-- 02-certs.sh
|       |       `-- scripts/
|       |           |-- 10-bootstrap-server.sh
|       |           |-- 11-check-runtime-environment.sh
|       |           |-- 12-prepare-runtime-directories.sh
|       |           |-- 13-generate-runtime-secrets.sh
|       |           |-- 20-issue-tls-certificates.sh
|       |           |-- 21-issue-self-signed-certificates.sh
|       |           |-- 22-render-runtime-configs.py
|       |           |-- 23-start-docker-services.sh
|       |           |-- 24-verify-deployment.sh
|       |           |-- 25-run-post-deploy-wizard.sh
|       |           |-- 26-pin-image-digests.py
|       |           |-- 30-run-full-deployment.sh
|       |           `-- (55-backup / 53-certs / 60-reset / 9x-compat wrappers)
|       |-- scripts/                   # Repo-side checks and GitHub helpers (not server runtime)
|       |   |-- checks/
|       |   `-- github/
|       `-- docs/
|-- data/
|   `-- umbra/                         # Runtime data, not in Git
|       |-- nginx/
|       |   |-- nginx.conf
|       |   |-- conf.d/
|       |   |-- stream.d/
|       |   |-- snippets/
|       |   |-- private/
|       |   `-- logs/
|       |-- marzban/
|       |   |-- db.sqlite3
|       |   |-- xray_config.json
|       |   |-- templates/
|       |   |   |-- clash/
|       |   |   `-- v2ray/
|       |   `-- logs/
|       |-- account/
|       |   `-- account.db
|       |-- vaultwarden/
|       |   `-- data/
|       |-- letsencrypt/
|       |-- certbot/
|       |   |-- www/
|       |   |-- config/
|       |   `-- hooks/
|       `-- private/
|           `-- reality.json
`-- backup/
    `-- umbra/
```
---

## Port Allocation

| Port | Visibility | Container | Purpose |
|------|-----------|-----------|---------|
| 80 | Public | umbra-nginx | HTTP, ACME challenge, redirect |
| 443 | Public | umbra-nginx | SNI stream entry (all HTTPS traffic) |
| 8443 | Internal | umbra-nginx | HTTP virtual hosts (after SNI handoff) |
| 10443 | Internal | umbra-marzban | Bundled Xray subprocess: VLESS + REALITY |
| 8000 | Internal | umbra-marzban | Marzban API + admin + subscription |
| 8080 | Internal | umbra-subproxy | Subscription metadata normalization |
| 3281 | Internal | umbra-account | Invite-bound account portal |
| 3210 | Internal | umbra-website | Ruyin public Next website |
| 3220 | Internal | umbra-account-web | User console and invite UI |
| 3230 | Internal | umbra-admin | Platform admin surface (built, not yet routed) |
| 80 | Internal | umbra-vaultwarden | Vaultwarden HTTP |

---

## Backend Stack Direction

Umbra currently has one Ruyin-owned business API: `umbra-account`, implemented
as `services/account/account.py`. It is a lightweight Python service for the
edge-node phase. `umbra-subproxy` is not a business backend; it is a small
metadata adapter for subscription responses.

Future formal business backends should use NestJS under `services/*-api/`.
Python remains appropriate for deployment scripts and narrow edge adapters.

---

## Git Repository Structure

The authoritative file list is the repository itself. The high-level layout is:

```
umbra/
|-- README.md
|-- CLAUDE.md
|-- .env.example
|-- docker-compose.yml
|-- brand/
|-- configs/
|-- deploy/
|   `-- worker-03/
|-- docker/
|-- docs/
|-- portals/
|   |-- website/
|   |-- console/
|   `-- admin/
|-- scripts/
`-- services/
```
