---
name: hysteria2-fallback
description: Hysteria2 UDP/QUIC fallback transport (vx-tokyo-h2) deployed as a standalone sidecar alongside reality; the hedge if the reality SNI gets GFW-fingerprinted
metadata: 
  node_type: memory
  type: project
  originSessionId: 9c55bf7a-9c6d-42e8-bf77-e54940744d22
---

Hysteria2 is the UDP/QUIC fallback transport, LIVE in prod since 2026-06-21
(main aad0b56, PR #109). It hedges the reality SNI-fingerprint arms race
([[reality-gfw-interference]]): if the reality camouflage SNI (www.icloud.com)
gets fingerprinted, clients switch to the H2 node, which is UDP + obfuscated and
immune to TLS-SNI fingerprinting. Client-verified working ~100ms after the Vultr
UDP fix below -- actually FASTER than reality's ~300ms cold latency test (QUIC
handshake + better congestion control on the long China->Tokyo path), so H2 is
viable as a daily primary, not just a fallback.

**Standalone, not a Marzban inbound**: Marzban's Xray core only supports
vmess/vless/trojan/shadowsocks (its ProxyTypes); no hysteria2, no hysteria
binary in the image. So H2 runs as its own container.

**Architecture**:
- `umbra-hysteria` container: image `tobyxdd/hysteria` (v2), `network_mode: host`,
  UDP 443 (no conflict with nginx TCP 443; clean QUIC, no docker-proxy UDP quirks).
- Reuses the EDGE_DOMAIN (vpn.ruyin.ai) LE cert via the letsencrypt mount.
- Stealth: salamander obfs + masquerade proxy -> https://www.icloud.com/.
- Auth: SINGLE SHARED PASSWORD (fallback MVP). Per-user is a future upgrade
  (would need a userpass store or hysteria's HTTP auth backend).
- Config: configs/hysteria/config.yaml.template -> 22-render ->
  RUNTIME_DIR/hysteria/config.yaml (0600), from etc/.env (HYSTERIA_PASSWORD,
  HYSTERIA_OBFS_PASSWORD). The shared password is in the rendered clash sub by design.
- Subscription: clash-subscription.j2 has a static vx-tokyo-h2 proxy (appended
  after Marzban's `{{ conf | only("proxies") | yaml }}` dump) + a PROXY-group
  entry, so every user's sub gets a second node (no subproxy change). The PROXY
  group is `url-test` (PR #110): it auto-selects the lowest-latency node (gstatic
  generate_204, interval 300s, tolerance 50ms) and auto-fails-over between reality
  and H2; DIRECT is excluded (in a url-test group it would always win at ~0ms and
  bypass the VPN; direct routing stays in the DIRECT rules).

**Secrets + firewall live OUTSIDE the repo**: HYSTERIA_PASSWORD/OBFS in server
etc/.env (generated `openssl rand -hex 24`; CI/CD never overwrites etc/.env, and
11-check-env aborts the deploy if unset). ufw must allow 443/udp (added to
10-bootstrap for rebuilds; opened on the live host 2026-06-21).

**CONFIRMED gotcha 2026-06-21 -- a UDP transport needs TWO firewalls open, not
one**: a Vultr Cloud Firewall was blocking ALL inbound UDP (TCP-only rules), so
H2 timed out while reality (TCP 443) worked. Proof: tcpdump at the host NIC
(which captures BEFORE ufw) saw 0 UDP arrivals on 443/8443/60000 across 240
client probes, while TCP/reality was fine -> the block was upstream of the host,
at Vultr's edge. Fix: add an inbound UDP rule in the Vultr panel; **Vultr labels
UDP 443 as "HTTP3"** (it is port-based, no DPI, so it passes hysteria's QUIC).
After adding it, client UDP 443 reached the host immediately. So any UDP service
here needs BOTH `ufw allow <port>/udp` AND the matching Vultr-panel UDP rule.

**Deploy wiring**: 12 makes RUNTIME_DIR/hysteria; 22 renders; 23-start pulls
tobyxdd/hysteria + health-gates umbra-hysteria; 24-verify checks the container +
UDP 443 listener; 26-pin pins its digest like other external images. The
clash-rules validator (19) ignores proxy nodes, so vx-tokyo-h2 does not trip it.

**To change/rotate H2 secrets**: edit etc/.env -> `deploy.sh config` (re-render)
-> `docker restart umbra-hysteria` -> users re-fetch sub. See [[cicd-deploy-flow]].
