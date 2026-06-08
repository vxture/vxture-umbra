#!/usr/bin/env bash
# Decide whether a main revision contains deployable changes.
#
# A change is "deployable" when it can affect built images or the running
# deployment. Pure documentation/metadata changes are NOT deployable, so the
# pipeline can skip the 6-image rebuild and the worker-03 redeploy for them.
#
# The base for comparison is the last successfully deployed revision on main
# (the head_sha of the most recent successful deploy-worker-03 run). This is
# robust to batched promotions, workflow re-runs, and previously skipped
# deploys. When no base is known, default to deployable (fail safe).
#
# Output (stdout, GITHUB_OUTPUT compatible):
#   deployable=true|false
#   base=<sha-or-empty>
#   reason=<short-reason>
#
# Usage: scripts/ci/changed-scope.sh <head_sha>
# Requires: git (full history), gh (authenticated via GH_TOKEN).
set -euo pipefail

head_sha="${1:?head sha required}"

emit() {
  echo "deployable=$1"
  echo "base=${2:-}"
  echo "reason=$3"
}

base_sha="$(
  gh run list --workflow deploy-worker-03.yml --branch main \
    --status success --limit 1 --json headSha --jq '.[0].headSha' 2>/dev/null || true
)"

if [ -z "$base_sha" ] || ! git cat-file -e "${base_sha}^{commit}" 2>/dev/null; then
  emit true "$base_sha" no-known-base
  exit 0
fi

if [ "$base_sha" = "$head_sha" ]; then
  emit false "$base_sha" already-deployed
  exit 0
fi

changed="$(git diff --name-only "$base_sha" "$head_sha")"

if [ -z "$changed" ]; then
  emit false "$base_sha" no-changes
  exit 0
fi

# Non-deployable paths: documentation and repo metadata only. Anything else
# (portals, services, configs, docker, compose, deploy scripts, brand assets,
# workflows, .env.example, etc.) is treated as deployable. When in doubt,
# deploy.
is_doc_only() {
  local f="$1"
  case "$f" in
    docs/*) return 0 ;;
    .claude/*) return 0 ;;
    CLAUDE.md|README.md|LICENSE) return 0 ;;
    *)
      # Any markdown file at the repository root (no slash in the path).
      if [ "${f%/*}" = "$f" ] && [ "${f%.md}" != "$f" ]; then
        return 0
      fi
      return 1
      ;;
  esac
}

while IFS= read -r f; do
  [ -z "$f" ] && continue
  if ! is_doc_only "$f"; then
    emit true "$base_sha" "deployable-change:$f"
    exit 0
  fi
done <<EOF
$changed
EOF

emit false "$base_sha" docs-only
