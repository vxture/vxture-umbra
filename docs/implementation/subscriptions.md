# Subscription Implementation

Subscriptions must remain Marzban-native.

## Public URL

The public URL format is:

```text
https://sub.ruyin.ai/sub/<marzban-token>
```

Do not rewrite public URLs to `/clash-meta`, `/v2ray`, username-based tokens, or custom converter paths.

## User-Facing Portal

`subscribe.ruyin.ai` is reserved for a future user-facing subscription portal.
Do not use it as the native subscription endpoint while `SUB_DOMAIN=sub.ruyin.ai`.

Preferred portal options:

1. Marzban-native subscription page/template, opened from the user's own token URL.
2. A thin authenticated portal that calls Marzban API and displays only the
   logged-in user's subscription URL.

Do not generate a static public index of all user subscription URLs.

## nginx Boundary

`configs/nginx/vhosts/04-sub.conf.template` exposes only:

```text
GET /sub/<token>
```

Everything else returns `404`, including:

```text
/
/sub
/sub/
/sub/<token>/clash-meta
```

## Marzban Token Behavior

Marzban may display a fresh-looking subscription token after a console refresh. That does not imply a user changed. Old saved tokens can remain valid while GET returns `200`.

Use GET for verification:

```bash
curl -sk -o /tmp/sub.yaml -w "%{http_code}\n" 'https://sub.ruyin.ai/sub/<token>'
```

Do not use HEAD as the success test; Marzban can return `405 Method Not Allowed`.

## Clash Template

Source:

```text
configs/marzban/clash-subscription.j2
```

Must-direct domain source:

```text
configs/marzban/must-direct-rules.txt
```

Rendered output:

```text
DATA_DIR/marzban/templates/clash/default.yml
```

The Clash template must only use variables exposed by Marzban's Clash renderer, such as:

```jinja2
{{ conf | only("proxies") | yaml }}
{% for tag in proxy_remarks %}
```

Do not use `user.username` in the Clash template. Marzban does not expose that object to this renderer, and using it can make Clash user agents receive `500 Internal Server Error`.

The subscription title is static and is set by Marzban's `SUB_PROFILE_TITLE` response header:

```yaml
#profile-title: Ruyin
```

In `docker-compose.yml`:

```yaml
SUB_PROFILE_TITLE: "${SUB_PROFILE_TITLE:-Ruyin}"
```

Proxy node names remain controlled by Marzban and `NODE_NAME`.

Microsoft, Cloudflare, Vultr, Umbra public service domains, and other must-direct
targets are rendered from `must-direct-rules.txt` before any `PROXY` rule. The
validator `scripts/deploy/07-validate-clash-rules.py` fails config rendering if
a must-direct domain is missing, appears after the first proxy boundary, or
overlaps any `PROXY` rule.

The current VPN/VPS public endpoint is also pinned as an exact `IP-CIDR` direct
rule. Do not rely only on `IP-ASN,20473,DIRECT`; local Clash cores can miss ASN
matches when the ASN database is unavailable, stale, or unsupported.

For immediate local testing, mirror rule changes into the current Clash Verge
profile YAML and keep an updated-profile backup next to it. Clash Verge can
overwrite the active YAML on subscription refresh, so the repository template is
the source of truth and the local backup is only a restore/reference copy.
