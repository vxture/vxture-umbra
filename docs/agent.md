# Umbra - Agent Entry Point

> Master entry point for AI assistants (Claude Code, Codex, DeepSeek).
> Read this first. Follow document links for detail.

---

## Project Identity

```
Name:       Vxture Umbra
Repo:       vxture/umbra
Node:       vxture-edge-01
User:       stone
Version:    v1.0-production
Purpose:    Production overseas edge entry node
```

**One-liner:**
> Umbra is a production-grade overseas edge node providing multi-user VPN access, subscription delivery, SNI-based domain routing, password management, status monitoring, and docs hosting - all behind a unified 443 entry.

**Principles:**
- No compromises on architecture - build it right from the start
- Replaceable node: rebuild rather than rescue
- Backend business machines are never the first public entry point
- Secrets never enter Git

---

## Service Inventory

| Service | Container | Domain | Purpose |
|---------|-----------|--------|---------|
| Nginx | `umbra-nginx` | gateway | SNI stream + HTTP virtual hosts |
| Website | `umbra-website` | ruyin.ai | Ruyin public Next.js homepage |
| Marzban + Xray | `umbra-marzban` | sub.ruyin.ai, admin.ruyin.ai, REALITY ingress | VPN user management, subscription, bundled Xray subprocess |
| Subscription Proxy | `umbra-subproxy` | internal | Normalizes subscription response metadata only |
| Account API | `umbra-account` | internal (BFF) | Auth and invite backend for the console and invite flows |
| Console Web | `umbra-account-web` | console.ruyin.ai, admin.ruyin.ai/invites | Invite-bound user dashboard and invite management UI |
| Admin Web | `umbra-admin` | built, not yet routed | Future dedicated platform-management surface; image published so routing can switch without pipeline changes |
| Vaultwarden | `umbra-vaultwarden` | pass.ruyin.ai | Password manager |
| Certbot | one-shot Docker container | ACME webroot | Let's Encrypt issue/renew automation |

---

## Domain Map

| Domain | Target | Notes |
|--------|--------|-------|
| `ruyin.ai` | Nginx -> umbra-website | Brand home and Hermes entry |
| `www.ruyin.ai` | Nginx -> ruyin.ai | Canonical redirect |
| `vpn.ruyin.ai` | Nginx -> 444 catch-all | Web surface retired; VPN node is REALITY on `:443` |
| `sub.ruyin.ai` | Nginx -> umbra-subproxy -> umbra-marzban | Marzban-native subscription endpoint with normalized metadata |
| `console.ruyin.ai` | Nginx -> umbra-account-web + umbra-account | User login, invite activation, subscription dashboard |
| `admin.ruyin.ai` | Nginx -> umbra-marzban; /invites -> account web/API | Marzban console and invite generation |
| `pass.ruyin.ai` | Nginx -> umbra-vaultwarden | Password manager |

---

## Current State

The v1.0 production edge node runs in production with automated CI/CD deploys to
production: all services in the inventory above are live behind the unified 443
entry, with HTTPS, REALITY ingress, Marzban subscriptions, backup automation,
and daily cert renewal in place. External uptime monitoring stays
operator-optional. Current work evolves the account portal toward a multi-app
identity model - see [`design/platform-identity.md`](design/platform-identity.md).

---

## Document Map

| Document | Content |
|----------|---------|
| [`agent.md`](agent.md) | **This file.** Identity, service inventory, domain map, constraints |
| [`specs/product.md`](specs/product.md) | Product scope and non-goals |
| [`specs/domains.md`](specs/domains.md) | Domain responsibilities and public URL contracts |
| [`specs/security.md`](specs/security.md) | Security boundaries and certificate modes |
| [`design/architecture.md`](design/architecture.md) | Traffic flow, SNI routing, container topology, directory layout |
| [`design/modules.md`](design/modules.md) | Per-service spec: config, volumes, ports, environment variables |
| [`design/decisions.md`](design/decisions.md) | Design decisions: security model, B++ rules, subscription design |
| [`design/platform-identity.md`](design/platform-identity.md) | Multi-app identity model: app bindings, invite app_key, identity broker |
| [`design/vxture-sso.md`](design/vxture-sso.md) | Vxture SSO handoff contract for the Ruyin console (auth start, callback, verify) |
| [`implementation/repository.md`](implementation/repository.md) | Current repository layout and source-of-truth paths |
| [`implementation/brand-assets.md`](implementation/brand-assets.md) | Brand asset spec: PNG/ICO source of truth, per-portal sync, build-time injection |
| [`implementation/config-rendering.md`](implementation/config-rendering.md) | Template renderer inputs, syntax, and outputs |
| [`implementation/scripts.md`](implementation/scripts.md) | Deployment script entrypoints and ordered steps |
| [`implementation/subscriptions.md`](implementation/subscriptions.md) | Native Marzban subscription rules and Clash title behavior |
| [`deployment/deployment.md`](deployment/deployment.md) | Deploy steps, .env reference, verification checklist, migration |
| [`deployment/checklists.md`](deployment/checklists.md) | Scenario matrix, preservation contracts, and deployment safety checklists |
| [`operations/operations.md`](operations/operations.md) | Backup, rollback, cert renewal, user management, monitoring |
| [`operations/github-actions.md`](operations/github-actions.md) | CI/CD branch flow, promotion contract, and production deployment design |
| [`operations/github-actions-enablement.md`](operations/github-actions-enablement.md) | Secrets, rulesets, and first-run checklist for enabling CI/CD |
| [`operations/certificate-incident.md`](operations/certificate-incident.md) | Certificate incident ledger and non-regression guardrails |
| [`operations/local-dev-environment.md`](operations/local-dev-environment.md) | Operator workstation notes for TUN, DeepSeek API, and Roo Code |
| [`memory/README.md`](memory/README.md) | **Memory mirror index.** AI-assistant persistent memory, summaries and pointers |
| [`memory/project-overview.md`](memory/project-overview.md) | Memory: stack, domain layout, architecture, Marzban HTTP-proxy decision |
| [`memory/deployment-modules.md`](memory/deployment-modules.md) | Memory: `deploy.sh` dispatcher, step scripts, config update workflow |
| [`memory/cicd-deploy-flow.md`](memory/cicd-deploy-flow.md) | Memory: git flow to production, promotion command, deploy gotchas |
| [`memory/memory-versioning-preference.md`](memory/memory-versioning-preference.md) | Memory: how the memory store is versioned in this repo |

---

## Global Build Constraints

1. **Edge Mode only** - no Simple Mode. Xray runs on internal port, never public.
2. **All traffic enters on 443** - Nginx SNI stream routes to correct internal service.
3. **SQLite** - Marzban, Account Portal, and Vaultwarden use SQLite for data storage. No PostgreSQL.
4. **Secrets never in Git** - `.env`, keys, certs, DB passwords all stay in `DATA_DIR/private/`.
5. **admin.ruyin.ai is public at nginx and protected by Marzban login** - see `specs/security.md`.
6. **All containers in one Docker network** - `umbra-net`, internal service discovery by container name.
7. **Subscription B++ rules built into Marzban template** - no external URL dependencies.
8. **Microsoft / Vultr / Umbra infrastructure must NOT be forced to PROXY** in B++ rules.
9. **Node name in subscriptions: `vx-tokyo`** (from `NODE_NAME` env var).
10. **Backup runs automatically** after every successful deployment and on daily cron.
11. **`DATA_DIR/private/` permissions: `700` dir, `600` files.**
12. **Scripts must be idempotent** - safe to re-run without destroying existing state.
13. **Maintenance text is ASCII English** - docs, scripts, configs, and comments avoid non-ASCII; user-facing localized pages may use UTF-8.
