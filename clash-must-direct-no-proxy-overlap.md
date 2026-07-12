---
name: clash-must-direct-no-proxy-overlap
description: Clash validator forbids PROXY rules overlapping must-direct domains; Microsoft enterprise OneDrive (microsoftonline.com/sharepoint.com) is the PROXY carve-out
metadata: 
  node_type: memory
  type: project
  originSessionId: 383aaccd-f270-4fca-aed0-13ef86929d37
---

`deploy/worker-03/scripts/19-check-clash-rules.py` enforces that NO `PROXY` rule
may overlap a must-direct domain (`proxy_overlaps_must_direct`): a PROXY value
that equals, is a subdomain of, or is a parent suffix of any must-direct entry
fails the gate. Consequence: you CANNOT keep a suffix must-direct and carve out
a subdomain to PROXY. To proxy something under a must-direct suffix, you must
REMOVE it from `configs/marzban/must-direct-rules.txt` entirely and add a PROXY
rule in `configs/marzban/clash-subscription.j2` (before `GEOIP,CN,DIRECT` and
`MATCH`).

**Microsoft split (PR #68, 2026-06-15, live):** Microsoft stays DIRECT overall,
BUT enterprise/work-school OneDrive could not log in from CN because Entra ID org
tenants geo-block direct logins. Personal accounts auth via `live.com` (direct,
works); enterprise auth via `microsoftonline.com` + stores on `sharepoint.com`.
So `microsoftonline.com`, `microsoftonline-p.com`, `sharepoint.com` were moved
OUT of must-direct and forced to PROXY (j2 "section 0a"). This routes ALL org
services on those suffixes (Teams/Outlook-web/Azure-portal login) through proxy,
not just OneDrive - intended, same geo-block. VPN server `207.148.95.189/32`
stays DIRECT in must-direct.

**Datadog REJECT - tried then ROLLED BACK (2026-06-15):** Blocked third-party
telemetry via a `REJECT` rule in clash-subscription.j2 "section 0b"
(http-intake.logs.us5.datadoghq.com; broad `datadoghq.com` first, then narrowed
to the intake host). User reported network problems and asked to remove it
(PR #72), so there are now NO REJECT rules in the ruleset. Lesson: the
validator/renderer permit `REJECT` (19-check-clash-rules.py ignores any non
DIRECT/PROXY line, so REJECT/DOMAIN-KEYWORD pass unchecked), but adding a block
risks breaking client connectivity - prefer DIRECT/PROXY and confirm with the
user before shipping a REJECT. Also: clients CACHE the subscription, so a bad
rule keeps biting until they manually refresh/restart - always tell the user to
refresh after any rule deploy.

Same-session OneDrive-client/CDN tweaks that DID stick: `sfx.ms` (OneDrive sync
client) and `vscode-cdn.net` (VS Code CDN) added to must-direct (PR #69);
`brightdata.com` direct (PR #70).

**How to apply:** Validate any rule edit locally by rendering must-direct ->
DIRECT lines, substituting into the j2 (jinja/non-rule lines are ignored by the
checker), then run `19-check-clash-rules.py --config <rendered> --env .env.example`;
expect `[OK] Clash must-direct rules verified: N`. Also run
`scripts/checks/06-check-deploy-contracts.py` (ASCII rule + must-/must-not-direct
asserts). Clients cache subscriptions - tell the user to refresh after deploy.

Related: [[clash-rule-ipcidr-only]], [[cicd-deploy-flow]], [[project-overview]].
