# Subscription Implementation

Subscriptions must remain Marzban-native.

## Public URL

The public URL format is:

```text
https://sub.ruyin.ai/sub/<marzban-token>
```

Do not rewrite public URLs to `/clash-meta`, `/v2ray`, username-based tokens, or custom converter paths.

## Metadata Normalization

`umbra-subproxy` is a thin metadata normalizer between nginx and Marzban. It
does not convert subscription formats and does not change the public URL.

It forwards `GET /sub/<token>` to Marzban, reads `/sub/<token>/info` to get the
username, and normalizes client-visible metadata:

```text
content-disposition: attachment; filename=Ruyin-USER01
profile-title: base64:<Ruyin-USER01>
#profile-title: Ruyin-USER01
```

The unquoted `filename=Ruyin-USER01` is intentional. Some clients display
Marzban's quoted filename literally or with escape slashes, such as
`\"USER01\`.

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

The subscription title prefix comes from `SUB_PROFILE_PREFIX`. Marzban still
receives `SUB_PROFILE_TITLE` as an upstream fallback:

```yaml
SUB_PROFILE_PREFIX: "${SUB_PROFILE_PREFIX:-Ruyin}"
SUB_PROFILE_TITLE: "${SUB_PROFILE_TITLE:-Ruyin}"
```

Proxy node names remain controlled by Marzban and `NODE_NAME`.

Microsoft, Vultr, Umbra public service domains, DeepSeek, and other must-direct targets
are rendered from `must-direct-rules.txt` before any `PROXY` rule. Cloudflare
account, dashboard, challenge, and edge service domains are explicit `PROXY`
rules so login flows do not get stuck on direct routing. The
validator `deploy/worker-03/scripts/19-check-clash-rules.py` fails config rendering if
a must-direct domain is missing, appears after the first proxy boundary, or
overlaps any `PROXY` rule.

Google service domains are explicit `PROXY` rules, including Gmail and regional
Google search domains such as `google.co.jp`. `google.com` alone does not match
country or regional Google domains, so each required suffix must be listed in
`configs/marzban/clash-subscription.j2`.

DeepSeek domains are also listed in `fake-ip-filter` so local applications such
as Roo Code receive real DNS answers instead of Mihomo/Clash synthetic
`198.18.0.0/16` addresses.

The current VPN/VPS public endpoint is also pinned as an exact `IP-CIDR` direct
rule. Do not use ASN routing rules in the subscription template; Clash cores may
try to download ASN databases before enabling the profile, and startup must not
depend on external database downloads.

For immediate local testing, mirror rule changes into the current Clash Verge
profile YAML and keep an updated-profile backup next to it. Clash Verge can
overwrite the active YAML on subscription refresh, so the repository template is
the source of truth and the local backup is only a restore/reference copy.
