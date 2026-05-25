# Umbra — Agent Entry Point

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
> Umbra is a production-grade overseas edge node providing multi-user VPN access, subscription delivery, SNI-based domain routing, password management, status monitoring, and docs hosting — all behind a unified 443 entry.

**Principles:**
- No compromises on architecture — build it right from the start
- Replaceable node: rebuild rather than rescue
- Backend business machines are never the first public entry point
- Secrets never enter Git

---

## Service Inventory

| Service | Container | Domain | Purpose |
|---------|-----------|--------|---------|
| Nginx | `umbra-nginx` | gateway | SNI stream + HTTP virtual hosts |
| Marzban + Xray | `umbra-marzban` | sub.ruyin.ai, console.ruyin.ai, REALITY ingress | VPN user management, subscription, bundled Xray subprocess |
| VPN Portal | `umbra-portal` | vpn.ruyin.ai | User onboarding, client downloads, docs |
| Vaultwarden | `umbra-vaultwarden` | pass.ruyin.ai | Password manager |
| Certbot | one-shot Docker container | ACME webroot | Let's Encrypt issue/renew automation |

---

## Domain Map

| Domain | Target | Notes |
|--------|--------|-------|
| `ruyin.ai` | Nginx → static landing | Brand home, navigation to services |
| `www.ruyin.ai` | Nginx → static content | Independent content from apex |
| `vpn.ruyin.ai` | Nginx → umbra-portal | VPN user entry, onboarding, client DL |
| `sub.ruyin.ai` | Nginx -> umbra-marzban | Marzban subscription endpoint |
| `subscribe.ruyin.ai` | reserved | Future user-facing subscription portal; do not use as `SUB_DOMAIN` |
| `console.ruyin.ai` | Nginx → umbra-marzban (IP-restricted + Marzban login) | Marzban admin panel |
| `pass.ruyin.ai` | Nginx → umbra-vaultwarden | Password manager |
| `vault.ruyin.ai` | Nginx → static placeholder | Reserved for future use |

---

## Current Milestone

**Building: v1.0 Production Edge Node**

Deploy order (dependencies drive sequence):

```
Phase 1 — Infrastructure
  [ ] Nginx (base config, HTTP only)
  [ ] Certbot (issue all certs)
  [ ] Nginx (HTTPS + SNI stream)

Phase 2 — Core Services
  [ ] Xray-core (VLESS + REALITY)
  [ ] Marzban
  [ ] VPN Portal (static site)

Phase 3 — Supporting Services
  [ ] Vaultwarden
  [ ] Docs site

Phase 4 — Hardening
  [ ] vpn-admin IP restriction
  [ ] Backup automation
  [ ] Logrotate
  [ ] Cert renewal cron
  [ ] External uptime monitoring configured (BetterStack / UptimeRobot)
```

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
| [`implementation/repository.md`](implementation/repository.md) | Current repository layout and source-of-truth paths |
| [`implementation/config-rendering.md`](implementation/config-rendering.md) | Template renderer inputs, syntax, and outputs |
| [`implementation/scripts.md`](implementation/scripts.md) | Deployment script entrypoints and ordered steps |
| [`implementation/subscriptions.md`](implementation/subscriptions.md) | Native Marzban subscription rules and Clash title behavior |
| [`deployment/deployment.md`](deployment/deployment.md) | Deploy steps, .env reference, verification checklist, migration |
| [`deployment/checklists.md`](deployment/checklists.md) | Scenario matrix, preservation contracts, and deployment safety checklists |
| [`operations/operations.md`](operations/operations.md) | Backup, rollback, cert renewal, user management, monitoring |
| [`operations/certificate-incident.md`](operations/certificate-incident.md) | Certificate incident ledger and non-regression guardrails |

---

## Global Build Constraints

1. **Edge Mode only** — no Simple Mode. Xray runs on internal port, never public.
2. **All traffic enters on 443** — Nginx SNI stream routes to correct internal service.
3. **SQLite** — all services (Marzban, Vaultwarden) use SQLite for data storage. No PostgreSQL.
4. **Secrets never in Git** — `.env`, keys, certs, DB passwords all stay in `DATA_DIR/private/`.
5. **console.ruyin.ai is IP-restricted before Marzban login** — see `specs/security.md`.
6. **All containers in one Docker network** — `umbra-net`, internal service discovery by container name.
7. **Subscription B++ rules built into Marzban template** — no external URL dependencies.
8. **Microsoft / Cloudflare / Vultr must NOT be forced to PROXY** in B++ rules.
9. **Node name in subscriptions: `vx-tokyo`** (from `NODE_NAME` env var).
10. **Backup runs automatically** after every successful deployment and on daily cron.
11. **`DATA_DIR/private/` permissions: `700` dir, `600` files.**
12. **Scripts must be idempotent** — safe to re-run without destroying existing state.

---

## v1.0 Success Criteria

```
[ ] All containers running: nginx, marzban, vaultwarden, portal, docs
[ ] HTTPS working on all 7 domains
[ ] Xray REALITY connection functional (test with Clash Verge)
[ ] Marzban admin accessible at console.ruyin.ai only when VPN-connected
[ ] Marzban subscription URL functional at sub.ruyin.ai
[ ] Subscription imports correctly into Clash Verge
[ ] Node name shows vx-tokyo
[ ] B++ rules present and correct (openai.com PROXY; microsoft.com, cloudflare.com, and vultr.com DIRECT)
[ ] Vaultwarden login functional at pass.ruyin.ai
[ ] Placeholder responding at vault.ruyin.ai
[ ] VPN Portal loading at vpn.ruyin.ai
[ ] Backup archive created with correct permissions (600)
[ ] Cert renewal cron configured
[ ] Sensitive files not present in Git
```
