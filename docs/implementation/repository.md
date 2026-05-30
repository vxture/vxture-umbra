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
| `scripts/server/` | Server lifecycle implementation |
| `scripts/deploy/` | Deploy pipeline implementation |
| `scripts/ops/` | Runtime operations implementation |
| `scripts/lib/` | Shared shell helpers |

See [`project-structure-plan.md`](project-structure-plan.md) for the target
portal layout, brand asset intake list, and cleanup phases.

Python in this repo is for deployment tooling, the current lightweight account
API, and narrow edge adapters. New formal business backends should use NestJS.

Avoid adding generated files, runtime data, certificates, SQLite databases, or server backups to the repo.
