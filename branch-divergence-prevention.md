---
name: branch-divergence-prevention
description: "How develop/main diverged (PR #169 to wrong base), two-layer fix: default branch=develop + CI guard that rejects PRs targeting main (PR #172, 2026-07-07)"
metadata: 
  node_type: memory
  type: project
  originSessionId: 5ce43862-5d93-4643-9093-1fee9aa9e179
---

# Branch Divergence Prevention (2026-07-07)

## How the divergence happened (PR #169 incident)

1. `gh pr create` was run without `--base develop` -- defaulted to `default_branch = main`
2. PR #169 merged to `main` directly (commit `6bf9bd3`)
3. Release triggered (correct), but `develop` was now behind
4. PR #170 squash-synced the content to `develop` -- produced a NEW commit `7448ab0`
   with the same content as `6bf9bd3` but a different SHA
5. `main` (`6bf9bd3`) was no longer an ancestor of `develop` (`7c24385`) -- diverged
6. `promote.yml`'s `git merge-base --is-ancestor origin/main origin/develop` check failed
7. Repair required: temporarily remove `non_fast_forward` from main ruleset, force-push
   main to `7c24385`, restore ruleset

**Root structural cause:** two enforcement gaps existed simultaneously:
- Gap A: `default_branch = main` made `gh pr create` without `--base` target main
- Gap B: CI (`quality-gate`) passed on PRs to main -- no rejection logic

## Two-layer fix shipped (PR #172 + default branch change)

**Fix 1 -- default branch changed to `develop`** (instant, no PR needed):
```
gh api -X PATCH repos/vxture/vxture-Umbra -f default_branch=develop
```
Effect: `gh pr create` without `--base` now targets `develop`; GitHub UI defaults to `develop`.

**Fix 2 -- CI guard step in `.github/workflows/ci.yml`** (PR #172, squash-merged 2026-07-07):
```yaml
- name: Reject PRs targeting main
  if: github.event_name == 'pull_request' && github.base_ref == 'main'
  shell: bash
  run: |
    echo "::error::PRs must target 'develop', not 'main'. Main only advances via promote.yml fast-forward."
    exit 1
```
Placed as the FIRST step in `static-checks`. Effect: any PR to `main` fails `quality-gate`
immediately; main's ruleset requires `quality-gate` to pass before merge, so the PR can
never land. `promote.yml` uses a direct `git push` (not a PR) -- unaffected.

## Current enforcement chain

```
gh pr create (no --base)  -->  base = develop  [Fix 1: default branch]
gh pr create --base main  -->  quality-gate FAILS  -->  ruleset blocks merge  [Fix 2: CI guard]
promote.yml git push       -->  direct push, bypasses PR rules, unaffected
```

## How to apply

- Always use `gh pr create --base develop` (defensive habit, even though Fix 1 covers omission)
- Never open a PR to `main` -- it will always fail CI by design
- If `promote.yml` fails with "merge-base not ancestor": check for divergence with
  `git log --oneline --graph origin/main origin/develop -6` before taking any action
- Ruleset force-push repair: remove `non_fast_forward` from main ruleset, force-push,
  restore -- requires admin; see [[cicd-deploy-flow]] for ruleset IDs
  (main release gate = 17155095, develop quality gate = 17155096)
