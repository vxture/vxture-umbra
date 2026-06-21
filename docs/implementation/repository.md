# Repository Implementation

Current top-level layout:

```text
umbra/
|-- .env.example
|-- docker-compose.yml
|-- README.md
|-- configs/
|-- docs/
|-- portals/
|   |-- website/
|   |-- console/
|   `-- admin/
|-- services/
`-- scripts/
```

Key implementation paths:

| Path | Purpose |
|---|---|
| `configs/nginx/nginx.conf` | Main nginx config copied to `DATA_DIR/nginx/nginx.conf` |
| `configs/nginx/stream.conf.template` | SNI routing rendered to `DATA_DIR/nginx/stream.d/stream.conf` |
| `configs/nginx/vhosts/*.conf.template` | HTTPS virtual hosts rendered to `DATA_DIR/nginx/conf.d/` |
| `configs/nginx/snippets/*.conf` | Shared nginx snippets copied to `DATA_DIR/nginx/snippets/` |
| `configs/xray/config.json.template` | Marzban-managed Xray config rendered to `DATA_DIR/marzban/xray_config.json` |
| `configs/marzban/clash-subscription.j2` | Marzban Clash template rendered to `DATA_DIR/marzban/templates/clash/default.yml` |
| `portals/website/` | Next.js public website for `ruyin.ai`, including reusable shell components and `public/assets/` |
| `portals/console/` | Next.js user portal for `console.ruyin.ai` and temporary invite UI |
| `portals/admin/` | Temporary admin portal boundary; invite UI will move here after route split |
| `services/account/account.py` | Current lightweight Python account/invite API; future formal business backend should be NestJS |
| `services/subproxy/subproxy.py` | Lightweight Python subscription response metadata adapter |
| `deploy/` | production server deployment package |
| `deploy/scripts/` | Numbered production deploy, ops, and recovery steps |
| `scripts/checks/` | Development and CI checks |
| `deploy/lib/` | Shared production shell helpers |

Deployment ownership boundary:

| Path | Owner | Worker deploy relationship |
|---|---|---|
| `docker-compose.yml` | Repository runtime contract | Used by production to pull and start the same services validated by CI |
| `configs/nginx/` | Shared runtime config templates | Rendered into `DATA_DIR/nginx/` by production deploy scripts |
| `configs/marzban/` | Shared subscription config templates and rules | Rendered into `DATA_DIR/marzban/` by production deploy scripts |
| `services/subproxy/` | Application/edge adapter source | Mounted or packaged as the `umbra-subproxy` service through compose |
| `services/account/` | Application API source | Mounted or packaged as the `umbra-account` service through compose |
| `deploy/` | production server deployment package | Calls, validates, renders, and operates the shared repo resources |

Do not move `docker-compose.yml`, `configs/`, or `services/` under
`deploy/`. The deploy package owns server-specific orchestration, not
the shared runtime contract, config templates, or application source. If a
worker needs host-specific compose changes, add a worker-scoped override such as
`deploy/compose.override.yml` instead of duplicating or relocating the
root compose file.

## Portal boundaries

- `portals/website` owns `ruyin.ai`; `portals/console` owns
  `console.ruyin.ai` and the temporary invite UI; `portals/admin` is the
  scaffolded `admin.ruyin.ai` surface (built, not yet routed).
- Design-system styling comes from `@vxture/design-system`; cross-product
  helpers from `@vxture/shared`. Umbra does not define its own design system.
- Brand PNG/ICO assets have a single source of truth under `brand/`; see
  [`brand-assets.md`](brand-assets.md). Do not deploy Vxture brand files as
  Ruyin assets.
- The invite admin UI currently lives in `portals/console`; it moves to
  `portals/admin` only after nginx routing and deploy checks are ready.

## Local development ports

Umbra reserves an independent local port block so it does not collide with the
Vxture monorepo. Production exposes only host `80` and `443`; nginx proxies to
these over the Docker network.

| Port | Service | Purpose |
|------|---------|---------|
| 3210 | `portals/website` (`umbra-website`) | Ruyin public website |
| 3220 | `portals/console` (`umbra-account-web`) | User console and invite UI |
| 3281 | `services/account` (`umbra-account`) | Lightweight account/invite API |

Other task lines must not allocate Vxture local services on `3210`, `3220`, or
`3281`, and must allow `http://localhost:3220` as a console SSO callback origin
during local development. (Full runtime port table: `design/architecture.md`.)

## Backend stack policy

Python in this repo is for deployment tooling, the current lightweight account
API, and narrow edge adapters. New formal business backends should use NestJS;
migrate `services/account/account.py` to a NestJS service under `services/*-api/`
only when account, invite, billing, audit, or admin workflows outgrow the
single-file edge-node implementation. Do not add a local `packages/` directory
for shared code while `@vxture/shared` covers it.

Avoid adding generated files, runtime data, certificates, SQLite databases, or server backups to the repo.
