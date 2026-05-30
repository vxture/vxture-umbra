# Config Rendering

`scripts/deploy/04-render-configs.py` is the only config renderer.

Run it with Python:

```bash
python3 scripts/deploy/04-render-configs.py
```

Do not run it with `bash`.

## Inputs

- `.env`
- `DATA_DIR/private/reality.json`
- templates and public guide files under `configs/` and `portals/`
- Ruyin website assets under `portals/website/public/` are served by the Next app container

## Template Syntax

Only `{{ SCREAMING_SNAKE_CASE }}` variables are rendered by `04-render-configs.py`.

Lowercase or mixed-case Jinja variables are intentionally left for Marzban's second-stage template rendering. Example:

```jinja2
{{ conf | only("proxies") | yaml }}
{% for tag in proxy_remarks %}
```

Do not use `user.username` in the Clash subscription template; Marzban does not expose that object to the Clash renderer.

## Outputs

| Source | Output |
|---|---|
| `configs/nginx/nginx.conf` | `DATA_DIR/nginx/nginx.conf` |
| `configs/nginx/stream.conf.template` | `DATA_DIR/nginx/stream.d/stream.conf` |
| `configs/nginx/vhosts/*.conf.template` | `DATA_DIR/nginx/conf.d/*.conf` |
| `configs/nginx/snippets/*.conf` | `DATA_DIR/nginx/snippets/*.conf` |
| `configs/xray/config.json.template` | `DATA_DIR/marzban/xray_config.json` |
| `configs/marzban/clash-subscription.j2` | `DATA_DIR/marzban/templates/clash/default.yml` |
| `portals/console/public/guide/**` | `DATA_DIR/portal/html/` |

## Website Assets

The Ruyin public website is a Next app in `portals/website/`.
Nginx proxies `ruyin.ai` to the `umbra-website` container.
`www.ruyin.ai` is a canonical redirect to `ruyin.ai`.

Website images live under `portals/website/public/assets/`.
The site favicon lives at `portals/website/public/favicon.ico`.

Use root-relative public URLs from Next components, for example:

```html
<img src="/assets/brand/ruyin-dark.png" alt="">
```
