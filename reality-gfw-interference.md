---
name: reality-gfw-interference
description: "VPN \"timeout\" root cause was GFW SNI-fingerprinting the overused www.microsoft.com reality dest; fixed 2026-06-21 by switching REALITY_SNI/DEST to www.icloud.com (config-only, no IP swap)"
metadata: 
  node_type: memory
  type: project
  originSessionId: 9c55bf7a-9c6d-42e8-bf77-e54940744d22
---

VPN "always timing out" (intermittent: mostly timeout, rarely 340/1480ms) on the
Tokyo node looked like a route/node/CI-CD problem but was **GFW DPI fingerprinting
the reality camouflage SNI `www.microsoft.com`** -- the single most overused
reality dest, so heavily flagged. A config-only SNI change fixed it; no IP swap,
no CDN needed.

**Ruled out, all proven healthy 2026-06-21 (node 167.179.73.161):** node 20/20
internal pure-handshake at 1-9ms; DNS correct (vpn.ruyin.ai -> new IP on every
resolver incl Clash's 223.5.5.5); route 106ms stable via PCCW, *faster* than a
paid VPN's working 150ms Japan node (so the China->Tokyo path is fine); path MTU
1480 but sustained camouflage transfer (200KB x6) 6/6 healthy -> no
loss/blackhole/MTU; reality config unchanged in recent deploys (not CI/CD).

**The clincher:** camouflage TLS-to-dest and the real authed tunnel share the same
5-tuple (same IP/443/TLS-looking). Camouflage proven healthy (handshake + 200KB x6)
while the authed tunnel timed out -> only a pattern-aware middlebox (DPI) can
selectively kill one. That also rules out path/node/config, which treat one
connection uniformly.

**Fix (worked instantly):** switch `REALITY_DEST`+`REALITY_SNI` to `www.icloud.com`
(less-common, China-reachable, Apple Tokyo edge, TLS1.3+h2 verified from the
server). Timeout gone; pubkey/shortId unchanged so old subs stayed valid after a
client re-fetch.

**SNI threads through 4 places that must all change together** (it lives in server
`etc/.env`, which CI/CD never overwrites): xray `serverNames`+`dest`, nginx stream
SNI->xray map, Marzban host `sni` (drives subscription `servername`). Procedure:
edit `etc/.env` -> `deploy.sh config` (re-render + nginx reload) -> `docker restart
umbra-marzban` (xray reload) -> PUT `/api/hosts` with new sni (wizard's API segment,
creds inherited from `etc/.env`; `deploy.sh all` does NOT run the wizard) -> user
re-fetches sub. A/B verify: handshake with new SNI returns the dest's real cert; old
SNI falls through to the web upstream (CN=ruyin.ai).

**Latency:** Clash latency-test ~300ms is cold-start overhead (~3x the 106ms RTT for
handshake round-trips), not lag; steady-state browsing rides warm connections near
RTT. The remembered "100ms" was ping.

**Diagnostic toolkit (still valid):** pure-handshake test inside the marzban
container (dial umbra-nginx:443 with the configured SNI + user pbk/shortId/uuid +
vision flow, socks target a LOCAL 127.0.0.1 service, success = socks 0x00) isolates
node health from path noise -- avoid api.ipify.org (CF rate-limit) and the server's
own public IP (hairpin NAT), which fake ~18/20. From the client, `openssl s_client`
to the IP with the dest SNI returns the dest's real cert when the camouflage path is
healthy; `curl --resolve dest:443:IP https://dest/` tests sustained large transfer
without a reality client. nginx stream-access.log: FAIL = 0 bytes back sub-second,
SUCCESS = long session_time + MB.

**Durability (arms race):** icloud may also get fingerprinted eventually. Hedges:
rotate to another low-profile TLS1.3+h2 dest, rotate shortIds, or move to a
non-TLS-reality transport -- **Hysteria2** (UDP, built-in obfuscation, immune to
TLS-SNI fingerprinting) or CDN-fronted VLESS+WS+TLS. Keep H2 as the robust fallback.
This SUPERSEDES the earlier "intermittent = unfixable China<->Tokyo path, IP-swap
won't help" read: IP-swap didn't help because the IP was never the issue -- the SNI
fingerprint was. Repo `.env.example` synced to icloud with a warning comment (PR to
develop). Node/layout facts in [[cicd-deploy-flow]].
