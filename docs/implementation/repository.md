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
| `portals/console/public/guide/` | Source for the public guide served under `vpn.ruyin.ai/guide/` |
| `portals/admin/` | Temporary admin portal boundary; invite UI will move here after route split |
| `services/account/account.py` | Current lightweight Python account/invite API; future formal business backend should be NestJS |
| `services/subproxy/subproxy.py` | Lightweight Python subscription response metadata adapter |
| `deploy/worker-03/` | worker-03 server deployment package |
| `deploy/worker-03/scripts/` | Numbered worker-03 deploy, ops, and recovery steps |
| `scripts/checks/` | Development and CI checks |
| `deploy/worker-03/lib/` | Shared worker-03 shell helpers |

Deployment ownership boundary:

| Path | Owner | Worker deploy relationship |
|---|---|---|
| `docker-compose.yml` | Repository runtime contract | Used by worker-03 to pull and start the same services validated by CI |
| `configs/nginx/` | Shared runtime config templates | Rendered into `DATA_DIR/nginx/` by worker-03 deploy scripts |
| `configs/marzban/` | Shared subscription config templates and rules | Rendered into `DATA_DIR/marzban/` by worker-03 deploy scripts |
| `services/subproxy/` | Application/edge adapter source | Mounted or packaged as the `umbra-subproxy` service through compose |
| `services/account/` | Application API source | Mounted or packaged as the `umbra-account` service through compose |
| `deploy/worker-03/` | worker-03 server deployment package | Calls, validates, renders, and operates the shared repo resources |

Do not move `docker-compose.yml`, `configs/`, or `services/` under
`deploy/worker-03/`. The deploy package owns server-specific orchestration, not
the shared runtime contract, config templates, or application source. If a
worker needs host-specific compose changes, add a worker-scoped override such as
`deploy/worker-03/compose.override.yml` instead of duplicating or relocating the
root compose file.

See [`project-structure-plan.md`](project-structure-plan.md) for the target
portal layout, brand asset intake list, and cleanup phases.

Python in this repo is for deployment tooling, the current lightweight account
API, and narrow edge adapters. New formal business backends should use NestJS.

Avoid adding generated files, runtime data, certificates, SQLite databases, or server backups to the repo.
