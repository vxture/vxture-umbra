# Umbra Fix Log

Running record of every bug found during live server testing and fixed in project code.
Goal: one-click deploy → fresh server operational with three commands.

---

## Session 4 - 2026-05-24

| File | Problem | Fix |
|---|---|---|
| `configs/nginx/vhosts/00-default.conf.template` | Duplicate `$connection_upgrade` `map` existed both in `nginx.conf` and default vhost include, risking nginx config-test failure | Removed duplicate vhost-level `map`; `nginx.conf` remains the single source |
| `configs/nginx/vhosts/05-console.conf.template` | Console vhost had Marzban login only but no nginx IP allow/deny after Basic Auth was removed | Added allow list for `127.0.0.1` and Docker/Xray subnet, with `deny all` for public requests |
| `scripts/deploy-all.sh`, `.env.example`, docs | Legacy console Basic Auth setup was still required even though the vhost intentionally does not use `auth_basic` | Removed unused htpasswd generation and `CONSOLE_HTPASSWD_PASSWORD` requirement; docs now describe IP restriction plus Marzban login |
| `scripts/steps/01-init-dirs.sh` | Nginx snippets were copied only if missing, so repo snippet updates could be skipped on redeploy | Always overwrite snippets from repo during directory initialization |
| `scripts/deploy-post.sh` | Unicode box drawing in subscription output had been corrupted in one line and could break shell parsing | Replaced the decorative subscription output box with ASCII-only lines |
| `scripts/steps/05-up.sh`, `scripts/deploy-certs.sh` | Marzban restarts forever if `/var/lib/marzban/tls/cert.pem` is missing; cert upgrade/renewal did not sync the public cert into Marzban's TLS directory | `05-up.sh` now fails fast when the edge cert is missing; cert upgrade/renewal now syncs `cert.pem`/`key.pem` before restarting Marzban |
| `scripts/deploy-certs.sh --upgrade` | Upgrade flow deleted all existing certificates before requesting replacements; hitting Let's Encrypt rate limits left the node without cert files | Backup existing `letsencrypt` first, restore automatically if issuance fails, then sync Marzban TLS only after successful issuance |
| `docker-compose.yml`, `.env.example` | Marzban rejects self-signed TLS unless `UVICORN_SSL_CA_TYPE=private`; temporary self-signed recovery could not start Marzban | Added `MARZBAN_SSL_CA_TYPE` env mapping, defaulting to `public` and allowing `private` during LE rate-limit recovery |
| `scripts/deploy-post.sh` | Vaultwarden confirmation accepted only `y`, so typing `yes` was treated as a negative answer | `confirm()` now accepts both `y` and `yes` |
| `configs/nginx/vhosts/04-sub.conf.template` | Subscription endpoint was being rewritten to `/sub/<token>/clash-meta`; requested public format is Marzban native `/sub/<token>` only | Proxied `/sub/<token>` unchanged to Marzban and kept every other path, including `/sub/<token>/clash-meta`, at 404 |
| `scripts/deploy-post.sh` | Post-deploy script had been converting API subscription URLs into custom username-token URLs | Kept Marzban API `subscription_url` as-is, so saved links stay in native `/sub/<token>` format |
| `configs/marzban/clash-subscription.j2` | Clash clients showed an escaped or unclear subscription profile name instead of the service/account identity | Added a file-header `profile-title` rendered as `Ruyin-USERNAME`, for example `Ruyin-USER01` |
| `scripts/steps/06-verify.sh` | Verification did not encode the subscription-domain edge cases discovered in live testing | Added explicit 404 checks for root, `/sub`, `/sub/`, and `/sub/<token>/clash-meta`; verifies a saved real subscription URL with GET when available |
| Docs | Live tests showed two easy operator mistakes: running `04-render-configs.py` with bash, and testing subscriptions with HEAD (`curl -I`) | Documented `python3 scripts/steps/04-render-configs.py`, GET-only subscription testing, dynamic Marzban tokens, and expected nginx 404 boundaries |

---

## Session 3 — 2026-05-23 (cont. 2)

| File | Problem | Fix |
|---|---|---|
| `docker-compose.yml` | Marzban container received `SUBSCRIPTION_URL_PREFIX` but reads `XRAY_SUBSCRIPTION_URL_PREFIX` → dashboard built subscription URLs from `window.location.origin` (console.ruyin.ai) instead of sub.ruyin.ai | Renamed env key to `XRAY_SUBSCRIPTION_URL_PREFIX` |
| `scripts/deploy-post.sh` | After the above fix, Marzban API returns full URL (`https://sub.ruyin.ai/sub/token`); script was still prepending `${SUBSCRIPTION_URL_PREFIX}` → doubled prefix in subscription URLs | Removed the prefix concatenation; API value is used as-is |

---

## Session 3 — 2026-05-23 (cont. 1)

| File | Problem | Fix |
|---|---|---|
| `scripts/deploy-post.sh` | Users created with `"vless": {}` → default flow `""` → subscription emits `flow: ''` → Clash Meta rejects with error quoting proxy name | Changed to `"vless": {"flow": "xtls-rprx-vision"}` |

**Root cause detail:** `clash.py:385` always writes `node['flow'] = settings.get('flow', '')` for VLESS+TCP+TLS.
An empty string is not a valid Clash Meta flow value; Clash's Go error formatter wraps the proxy name
in `%q` quotes, producing `"ruyin-user01"` in the validation error — the reported symptom.

---

## Session 3 — 2026-05-23

| File | Problem | Fix |
|---|---|---|
| `configs/marzban/clash-subscription.j2` | Used `proxies`/`proxy_tags` variable names; Marzban actually passes `conf`/`proxy_remarks` | Changed to `{{ conf \| only("proxies") \| yaml }}` and `{% for tag in proxy_remarks %}` |
| `scripts/deploy-post.sh` | Users created without `inbounds` → all inbounds auto-excluded via `exclude_inbounds_association` → empty subscriptions | Added `"inbounds": {"vless": ["VLESS_TCP_REALITY"]}` |
| `scripts/deploy-post.sh` | No host configuration → subscription generates proxies with no address/SNI → empty node list | Added `PUT /api/hosts` step after authentication to configure `EDGE_DOMAIN:443` + SNI + chrome fingerprint |
| `scripts/deploy-post.sh` | Subscription URLs missing `/clash-meta` suffix → Clash client requests wrong endpoint → wrong content type | Appended `/clash-meta` to all generated URLs |
| `configs/marzban/clash-subscription.j2` | Proxy name `"🚀 {USERNAME}"` — emoji U+1F680 is above Unicode BMP → PyYAML emits `\U0001F680` escape even with `allow_unicode=True` | Removed emoji; remark is now plain `{USERNAME}` |
| `configs/marzban/clash-subscription.j2` | User-defined `DIRECT` and `REJECT` proxy groups shadow Clash built-ins → loop detected: `[PROXY DIRECT REJECT]` | Removed DIRECT and REJECT groups from template; only `PROXY` group remains |
| `scripts/steps/04-render-configs.py` | `{{ tag }}` (Jinja2 loop variable) triggered WARN as if it were a missing env var | WARN now only emitted for SCREAMING_SNAKE_CASE tokens |
| `scripts/steps/04-render-configs.py` | `nginx.conf` skipped if file existed → repo changes never propagated | Removed skip-if-exists; always overwrite |

---

## Session 2 — 2026-05-22

| File | Problem | Fix |
|---|---|---|
| `scripts/server-init.sh` | UFW not configured → all ports except SSH accessible by default | Added rules: 22/80/443 |
| `scripts/server-init.sh` | `git clone` as root → "dubious ownership" error | Added `git config --global safe.directory` |
| `scripts/server-init.sh` | `/srv/vxture/data` not pre-created → `chown` silently skipped | Pre-build repo + data dirs before `chown` |
| `scripts/deploy-all.sh` | Allowed root to run → created root-owned files in `DATA_DIR` | Added root detection; exits with error |
| `scripts/deploy-post.sh` | Same root issue | Same root detection |
| `configs/nginx/nginx.conf` | No `$connection_upgrade` map → WebSocket proxy broken | Added `map` block in `http {}` |
| `configs/nginx/vhosts/05-console.conf.template` | `auth_basic` on all locations → broke Marzban React's JSON API calls | Removed `auth_basic`; Marzban uses JWT |
| `configs/nginx/vhosts/05-console.conf.template` | `GET /` returned CSS animation (Ulam spiral) instead of login page | Added `location = /` redirect to `/dashboard/` |
| `configs/nginx/vhosts/05-console.conf.template` | Redirect URL leaked internal port `:8443` | Changed to `$http_host` |

---

## Session 1 — 2026-05-21

| File | Problem | Fix |
|---|---|---|
| `scripts/server-init.sh` | Disabled root SSH (`PermitRootLogin no`) → no recovery path if stone user breaks | Removed that line |
| `scripts/steps/03-issue-certs.sh` | Certificate check used filename prefix instead of issuer → self-signed certs misidentified as Let's Encrypt | Changed to `openssl x509 -issuer` check |
| `scripts/steps/03-issue-certs.sh` | `tee /tmp/certbot.log` → permission denied | Removed tee; output goes directly to stdout |
| `scripts/deploy-certs.sh --upgrade` | Used `docker restart` instead of `docker compose up -d` | Changed to `docker compose up -d --force-recreate` |
| `scripts/deploy-certs.sh --upgrade` | Root-owned Let's Encrypt cert files couldn't be deleted by `stone` | Used `docker run --rm httpd` container to delete |
| `scripts/steps/05-up.sh` | Health check used restart count → cumulative count caused false failures | Changed to container `State` field |
| `scripts/lib/env.sh` | `SCRIPT_DIR` variable overwrote caller's variable | Renamed to `_UMBRA_LIB_DIR` |
| `scripts/deploy-all.sh` htpasswd section | nginx worker couldn't read `nginx/private/.htpasswd` | Added `chmod 711 DATA_DIR/nginx/private` |
| `scripts/steps/01-init-dirs.sh` | Copied nginx snippets only if absent → repo changes not propagated | Removed skip logic; always overwrite |
| All deploy scripts | `docker exec` without `-i` → heredoc stdin not passed to container | Changed all `docker exec` to `docker exec -i` |

---

## Marzban internals (discovered during debugging)

- `ClashConfiguration.add()` returns early for VLESS — only handles vmess/trojan/shadowsocks
- `ClashMetaConfiguration.add()` handles VLESS+REALITY — triggered by `/{token}/clash-meta` path
- Template render context: `{"conf": self.data, "proxy_remarks": self.proxy_remarks}`
- `self.data = {'proxies': [], 'proxy-groups': [], 'rules': []}` — proxies is a list of dicts
- Custom Jinja2 filters: `yaml` (`yaml.dump(allow_unicode=True)`), `only`, `except`
- `yaml.load(template_output) → yaml.dump(sort_keys=False)` round-trip strips custom indentation
- `exclude_inbounds_association` table: creating a user without specifying `inbounds` auto-excludes all inbounds
- Host config (`PUT /api/hosts`) must be done before subscription generation or proxy list is empty
- `clash.py:385`: `node['flow'] = settings.get('flow', '')` — always writes flow; empty string is invalid in Clash Meta
