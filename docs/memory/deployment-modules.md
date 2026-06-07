# Deployment Modules (memory mirror)

> Mirror of memory `deployment-modules`. Authoritative detail lives in
> [`../implementation/scripts.md`](../implementation/scripts.md) and
> [`../deployment/deployment.md`](../deployment/deployment.md).

**Entry point:** `bash scripts/deploy.sh <command>`

| Command | Script | Description |
|---------|--------|-------------|
| `all` | `deploy-all.sh` | Full deployment (idempotent) |
| `check` | `steps/00-check-env.sh` | Env vars, Docker, DNS, ports |
| `dirs` | `steps/01-init-dirs.sh` | Create DATA_DIR structure |
| `keys` | `steps/02-generate-reality.sh` | x25519 keypair -> DATA_DIR/private/reality.json |
| `certs` | `steps/03-issue-certs.sh` | LE certs via certbot webroot |
| `certs --upgrade` | `deploy-certs.sh --upgrade` | Replace self-signed with real LE certs |
| `certs --status` | `deploy-certs.sh --status` | Show cert expiry |
| `config` | `steps/04-render-configs.py` + nginx reload | Re-render templates, apply to running nginx |
| `up` | `steps/05-up.sh` | docker compose pull + up -d |
| `verify` | `steps/06-verify.sh` | Check containers, endpoints, certs, DBs |
| `backup` | `steps/07-backup.sh` | Archive configs + SQLite snapshots |
| `post` | `deploy-post.sh` | Create Marzban users, show sub URLs |
| `reload` | - | nginx -s reload |
| `restart [svc]` | - | docker compose restart |
| `status` | - | docker compose ps |
| `logs [svc]` | - | docker compose logs -f |

**deploy-all.sh flags:**
- `--skip-verify` - skip step 06 (useful during iteration)
- `--skip-backup` - skip step 07

**Config update workflow:**
```bash
# Edit a template in configs/, then:
bash scripts/deploy.sh config
```

**Why:** Previously deploy-all.sh was all-or-nothing; a verify failure would
abort even if services were running. Now verify/backup are non-fatal warnings
in deploy-all.sh.

> Note: the worker-03 production pipeline uses the modular scripts under
> `deploy/worker-03/` driven by CI/CD; see
> [`cicd-deploy-flow.md`](cicd-deploy-flow.md).
