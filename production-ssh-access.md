---
name: production-ssh-access
description: "How to SSH into the umbra production node for ops (.env edits, container/log checks)"
metadata: 
  node_type: memory
  type: reference
  originSessionId: 03a76e6a-6260-4afc-b2d0-8e515c19ebee
---

Production node: **`stone@167.179.73.161`** (Vultr; the worker-03 -> production node, see [[cicd-deploy-flow]]).

SSH key is **`~/.ssh/vxtureworker03-vultr/vultr-access`** — must pass it explicitly: `ssh -i "$HOME/.ssh/vxtureworker03-vultr/vultr-access" stone@167.179.73.161`. The default `~/.ssh/id_ed25519` is NOT authorized (Permission denied); `root@` is also denied — use `stone`. `167.179.73.161` is already in `known_hosts`.

Operator `.env` lives at **`/srv/umbra/etc/.env`** (owned by stone, bash-sourceable; quote whitespace values — see [[ruyin-oidc-promotion-pending]]). Backups `.env.bak.*` are gitignored.

Renaming a runtime env var (e.g. PASS_DOMAIN -> PAS_DOMAIN, done 2026-06-25) needs a zero-risk rollout because old code reads the old name and new code the new one: **① add the new var alongside the old, ② merge+promote+deploy, ③ delete the old var**. Deploy's `11-check` fails on an undefined required `<SUBDOMAIN>_DOMAIN` var, so the value must be present before release runs.
