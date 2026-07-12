---
name: cicd-deploy-flow
description: "GitHub Actions CI/CD flow to ship a change to the production node 167.179.73.161, rsync-no-clone deploy, /srv/umbra layout, promotion command, gotchas; deploy identifiers renamed worker-03 -> production/DEPLOY_*/deploy 2026-06-21"
metadata: 
  node_type: memory
  type: project
  originSessionId: a24b8b4e-44c5-4c64-bea4-f7f29f002361
---

# CI/CD Deploy Flow (to the worker node)

Design doc: `docs/operations/github-actions.md`. This is the actionable runbook +
gotchas verified in practice. Service deploy internals live in [[deployment-modules]].

**2026-06-21 MIGRATION (worker-03 -> worker-04) + layout/deploy redesign (PR #106/#107, prod):**
- **Physical server moved**: old worker-03 `207.148.95.189` -> new `vx-worker-04` `167.179.73.161`
  (Vultr Tokyo, Ubuntu 26.04, 1 core/950MB). SSH user `stone` (root login DISABLED), same
  `vultr-access` key. Old server kept RUNNING as rollback (decommission TBD once stable).
  The CI job/environment/secrets initially KEPT their `worker-03`/`WORKER_03_*` names (only
  values repointed) but were **RENAMED 2026-06-21 (PR #111)**: job `deploy-worker-03` ->
  `deploy`, environment `worker-03` -> `production`, secrets `WORKER_03_*` -> `DEPLOY_*`,
  concurrency `release-worker-03` -> `release-production`. The old `worker-03` env +
  `WORKER_03_*` secrets were DELETED after the first green deploy on the new names.
  `DEPLOY_REPO_DIR` left UNSET (release.yml default `/srv/umbra/deploy`). KEPT: retired
  filename `deploy-worker-03.yml` + internal `WORKER_DEPLOY_DIR` (a deploy-package term).
- **Server layout flattened/shallowed**: `/srv/vxture/{repo,data,backup}/umbra` ->
  `/srv/umbra/{etc,deploy,runtime,data,backup}`. `etc/.env` is the persistent operator config
  (NOT in `deploy/`, which is disposable). `runtime/` = rendered nginx config (regenerable);
  `data/` = state (marzban db, vaultwarden, account, redis, private/reality.json, letsencrypt);
  `REPO_DIR`=`/srv/umbra/deploy`. `01-env.sh` sources `$PROJECT_ROOT/etc/.env` (lib/../..).
- **No git clone on the server**: release.yml's `deploy` job now `actions/checkout`s then
  **rsyncs the deploy subset** (`deploy/`, `configs/`, `docker-compose.yml`) to `/srv/umbra/deploy`
  (writes a `VERSION` file with the SHA) instead of `git fetch/checkout` on the host.
- **Repo deploy dir flattened**: `deploy/worker-03/` -> `deploy/` (step scripts now at
  `deploy/scripts/`, e.g. `deploy/scripts/19-check-clash-rules.py`; lib at `deploy/lib/`).
- **Domain rename**: `pass.ruyin.ai` -> `pas.ruyin.ai` (vaultwarden; vhost is `{{ PASS_DOMAIN }}`-driven).
- **GOTCHA (cost a failed deploy)**: setting a `gh secret` whose value is a `/abs/path` FROM
  Git Bash on Windows -> MSYS mangles `/srv/umbra/deploy` into `D:/Program Files/Git/srv/umbra/deploy`.
  Use `MSYS_NO_PATHCONV=1 gh secret set ...` or rely on the YAML default. (`WORKER_03_REPO_DIR`
  was deleted so the release.yml default `/srv/umbra/deploy` applies.)
- **GOTCHA**: the rsync deploy job MUST `actions/checkout` first (a separate job from `build`,
  no implicit checkout) or rsync fails "change_dir ... No such file or directory" (fixed PR #107).
- VPN/GFW reliability after the move: see [[reality-gfw-interference]] (swapping Vultr Tokyo IPs
  did NOT escape the China-path interference; the node itself is healthy).

**Branch protection** is enforced via modern GitHub **Rulesets** (NOT legacy branch
protection — `branches/*/protection` returns 404; check `gh api repos/vxture/vxture-Umbra/rulesets`).
Two active rulesets, "Umbra main release gate" (17155095) and "Umbra develop quality
gate" (17155096), each enforce on their branch: block deletion, block non-fast-forward,
require linear history, and require the `quality-gate` status check with
`strict_required_status_checks_policy: true` (branch must be up-to-date with base before
merge — tightened 2026-06-08). Repo merge settings (also tightened 2026-06-08):
squash-merge only (`allow_merge_commit`/`allow_rebase_merge` = false),
`delete_branch_on_merge` = true. The **develop** ruleset ALSO enforces a `pull_request`
rule with `required_approving_review_count: 0` (added 2026-06-08, solo-dev): merges to
develop MUST go through a PR but need no approval -- you cannot `git push origin develop`
directly anymore, open a PR even for trivial changes. This closed the last workflow gap
("PR-only was convention, not enforced") and was VERIFIED 2026-06-08: a direct
`git push origin develop` is rejected with `GH013 ... Required status check "quality-gate"
is expected` + `Changes must be made through a pull request`. The **main** ruleset deliberately
has NO `pull_request` rule: main only advances via promote.yml's `git push origin
HEAD:main` (a direct FF push, not a PR). A pull_request rule on main with no bypass actor
WOULD BLOCK that promotion push ("Changes must be made through a pull request") and break
production releases -- do not add one unless you also add a bypass actor for the promotion
identity.

**Branch flow (strict — `main` is protected, no direct human push):**
```
feature branch -> PR to develop -> ci (quality-gate) -> squash-merge to develop
  -> ci on develop -> controlled promotion develop->main (promote.yml, workflow_dispatch)
  -> release on main PUSH: detect -> docker-build (6 images) -> deploy (auto SSH)
```
NOTE (P3a+P3b, 2026-06-08): CI no longer runs on `main` (it re-tested the
identical FF'd sha). docker-build.yml + deploy-worker-03.yml were CONSOLIDATED
into a single `release.yml` triggered on `push: main` (event=push, github.sha)
with three sequential jobs detect -> docker-build -> deploy (one
change-detection pass, no workflow_run hops). The promote FF push (via
PROMOTION_TOKEN PAT) fires `on: push`, so the chain runs. To find the last
deploy/base, query `gh run list --workflow release.yml` (NOT the old files).
GOTCHA (fixed PR #28, 2026-06-08): release.yml `detect` must NOT use a bash
associative array read under `set -u` -- an empty `${#want[@]}`/`${!want[@]}`
raises "unbound variable" (bash 5.2). It only triggers when a deployable change
maps to NO image (scripts-/configs-/deploy-/compose-only). PR #27 (a scripts-only
change) was the first to hit it; the release run failed at detect but production
was unaffected (CI-only change, no-op deploy). detect now uses a space-separated
string deduped via `sort -u`. A deployable-but-no-image change correctly yields
build_images=[] -> all images retagged -> deploy recreates nothing.
GOTCHA (fixed PR #30, 2026-06-08): Next.js standalone `server.js` binds to
`$HOSTNAME`, and Docker auto-sets HOSTNAME to the container id, so the
website/console/admin containers listened only on the container IP, NOT
127.0.0.1. nginx (service-name -> container IP) worked so the site was fine, but
the 127.0.0.1 `/api/health` container healthcheck added in #29 could never pass
(stuck "health: starting", deploy warned "not healthy after 60s"). Fix: set
`ENV HOSTNAME=0.0.0.0` in each portal runner stage. (python services
account/subproxy already bind 0.0.0.0, so their loopback healthchecks were fine.)
`develop` = integration branch; updating `main` == production release approved.
Always branch off `origin/develop`, never off a stale local branch.

**Promotion command** (only normal path to advance `main`; needs develop CI green first):
```
gh workflow run promote.yml -f target=main \
  -f expected_sha=<origin/develop SHA> \
  -f release_confirmed=true \
  -f release_note="<summary>"
```
promote.yml validates: target=main, release_confirmed=true, release_note non-empty,
expected_sha == origin/develop, main is ancestor of develop, and develop's
`quality-gate` check == success. Then fast-forwards main and pushes.

**Gotchas:**
- `PROMOTION_TOKEN` IS configured, so the FF push to main triggers the downstream
  `ci -> docker-build -> deploy` chain (GITHUB_TOKEN pushes would not).
- Two timing/efficiency facts to respect (see [[cicd-efficiency-findings]]):
  - After merging a PR to develop you MUST wait for develop's `quality-gate` to go
    green BEFORE running promote.yml -- promoting too fast fails validation
    (conclusion != success), main is left untouched. (Hit this 2026-06-08.)
  - docker-build/deploy each run a `detect` job that compares the promoted sha
    against the last successful deploy; docs-only diffs (docs/, .claude/, root md,
    LICENSE) skip build+deploy. Detect uses `gh run list --repo "$REPO"` (NO
    checkout, so --repo is required or base resolves empty -> always deploys).
- Deploy is **digest-pinned** (P1): `23-start` renders `$DATA_DIR/docker-compose.digests.yml`
  via `26-pin-image-digests.py` and runs `up -d --remove-orphans` with it. External
  images (marzban/vaultwarden) pin to their running digest and correctly stay `Running`
  across deploys. Minimal-recreate is delivered by **P2** (PR #23): docker-build's `detect`
  outputs `build_images` (changed-file -> image map; unknown paths -> build all), and each
  matrix job builds changed images while `imagetools create`-retagging the rest
  (latest -> sha-<commit>, same digest). Unchanged images keep their digest, so the deploy
  recreates ONLY changed services. VERIFIED 2026-06-08 (PR #24): changing only subproxy.py
  recreated ONLY umbra-subproxy; the other 7 stayed Running (healthy in 2s).
  (History: P1 alone did NOT achieve this -- buildx mints a new digest per build even for
  identical content, so before P2 every push rebuilt all 6 and recreated all 6. The
  "cache hit -> identical digest" assumption was wrong; P2's build-vs-retag is what makes
  unchanged digests stable.)
- `docker-build` intermittently fails at **"Set up Docker Buildx"** (infra flake, not
  code). Fix: `gh run rerun <run-id> --failed`; the re-run's success re-fires deploy.
- promote.yml runs the workflow file from `main`, so workflow self-changes (e.g. action
  version bumps) show their effect/warnings one promotion late.
- Squash merges mean `git branch -d` refuses merged branches as "not fully merged";
  use `-D` after confirming the PR is MERGED via `gh pr view`.
- CI has an ASCII-only contract check on source/docs — non-ASCII (em-dashes `—`,
  smart quotes) fails `Static script checks`. Keep docs ASCII.
- Clash rule renders are guarded by `deploy/scripts/19-check-clash-rules.py`
  during deploy `verify`; a green deploy means the rendered config passed it.
- After deploy, `git branch -vv` shows merged remotes as `: gone` (prune with
  `git fetch --prune`); local `main` can drift behind/diverge — realign with
  `git reset --hard origin/main`.
