---
name: ruyin-oidc-promotion-pending
description: "ruyin OIDC RP shipped to production 2026-06-18; deploy gotchas (bash-sourced .env, redirect_uri host, DNS must be grey-cloud)"
metadata: 
  node_type: memory
  type: project
  originSessionId: 6c5e6192-40d9-43ce-a083-c5873fac15ed
---

STATUS 2026-06-18: **OIDC RP is LIVE in production.** main == develop ==
`a090575` (PRs #77/#78/#79/#80/#81). Deploy verify confirmed
`console.ruyin.ai OIDC login redirects to authorize (307)` and 40/40 checks
passed. See [[ruyin-oidc-rp]] for the architecture. (Name kept for link
stability; this is now the deploy/ops-learnings record, no longer pending.)

Deploy gotchas hit during rollout (all resolved, keep for future deploys):

1. **`.env` is sourced via bash** (`set -a; source .env` in deploy lib/01-env.sh).
   A bare multi-word value (`OIDC_SCOPES=openid profile ruyin`) makes bash run
   `profile` -> exit 127, aborting before `compose up`. `docker compose
   --env-file` does NOT word-split, so it passes compose validation but breaks the
   real deploy. ALWAYS quote whitespace values: `OIDC_SCOPES="openid profile ruyin"`.
   Guarded now by contract check `check_env_example_is_source_safe` in
   `06-check-deploy-contracts.py` (rejects unquoted-whitespace values in .env.example).

2. **OIDC_REDIRECT_URI = `https://ruyin.ai/auth/callback` (APEX) - VERIFIED by live
   test.** Curling `accounts.vxture.com/oidc/authorize` with the apex returns 302
   to the login page (accepted); console.ruyin.ai and www.ruyin.ai both return
   `400 invalid_redirect_uri`. This is the ONLY registered value - do not change it.
   The IdP strictly whitelists redirect_uri; the ruyin oidc_client is registered
   with the apex (standard section 11: redirect_uris derive from
   RUYIN_BASE_URL=https://ruyin.ai). PR #80 wrongly set it to console.ruyin.ai and
   got `400 invalid_redirect_uri`; PR #82 reversed it: nginx 01-ruyin now serves
   `location ^~ /auth/` -> umbra-account-web on the apex (marketing stays at /,
   /api/account/ -> umbra-account), redirect_uri back to apex. The RP routes still
   live in umbra-account-web; the apex just proxies /auth/* to it. console.ruyin.ai
   also serves /auth via its catch-all but the registered host is the apex.

3. **DNS must be grey-cloud (DNS-only), pointing directly at worker-03**
   (207.148.95.189, Vultr). The deploy's `11-check` DNS step compares each domain's
   A record to the server public IP and fails if mismatched (Cloudflare-proxied
   104.21.x.x triggered "fix DNS or set CERTBOT_SKIP=true" for ruyin.ai/www/console/
   admin/pass). For LE HTTP-01 they must resolve to the server. CERTBOT_SKIP=true is
   the alternative if CF fronts TLS (not used here). My local resolver returns
   <none> for these domains; query via `dig +short @1.1.1.1` to verify.

Standard promote command (see [[cicd-deploy-flow]]): re-fetch origin/develop SHA
at promote time. A docs/scripts-only promote (e.g. #81) is correctly detected as
non-deployable -> docker-build + deploy skipped.

4. **worker-03 disk fills from repeated rebuilds (23G vda2).** Many promotes in a
   day = each builds 6 images; old tagged images + BuildKit cache accumulate in
   /var/lib/docker and can fill the disk -> deploy fails early at `git fetch`
   ("No space left on device", exit 128), BEFORE compose up (so prod containers
   are untouched - no outage). Reclaim safely (data is in bind mounts under
   $DATA_DIR, not docker volumes): `docker image prune -af && docker builder
   prune -af` (plain `image prune` without -a only removes dangling, leaves
   tagged-unused; build cache needs `builder prune`). Minor extra: journal
   (`journalctl --vacuum-size=100M`), apt cache (`apt-get clean`). Then
   `gh run rerun <release-run-id> --failed` re-runs just deploy-worker-03 (images
   already built). FOLLOW-UP idea: add an image-prune step to the deploy so it
   self-cleans.

User profile claims (PR #83) shipped to prod 2026-06-18 (main 20a7cc1): panels
now show all IdP-supported claims (email/phone+verified, account_status, roles,
active_org, active_workspace, user_type, sub). IdP has NO name/username/picture
claim, so those render "-". Live claim names confirmed via discovery doc:
active_org/active_workspace/roles (NOT the standard's active_tenant*).
