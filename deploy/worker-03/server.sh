#!/usr/bin/env bash
# Server lifecycle dispatcher.
#
# Usage:
#   bash deploy/worker-03/server.sh <command> [args]
#
# Commands:
#   init              Bootstrap a fresh server; run as root
#   reset [--full]    Stop or wipe this node; run as admin user
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

CMD="${1:-}"
shift || true

_usage() {
  echo ""
  echo "  Usage: bash deploy/worker-03/server.sh <command> [args]"
  echo ""
  echo "  Purpose:"
  echo "    Manage worker-03 host lifecycle tasks."
  echo "    Use this for first-time server bootstrap or explicit reset only."
  echo ""
  echo "  Server lifecycle:"
  echo "    init              Bootstrap server packages, admin user, SSH keys"
  echo "    reset [--full]    Stop containers or wipe runtime data"
  echo ""
}

case "$CMD" in
  -h|--help|help)
    _usage
    exit 0
    ;;
  init)
    exec bash "$SCRIPT_DIR/scripts/10-bootstrap-server.sh" "$@"
    ;;
  reset)
    exec bash "$SCRIPT_DIR/scripts/60-reset-runtime-services.sh" "$@"
    ;;
  "")
    _usage
    exit 1
    ;;
  *)
    echo "[ERROR] Unknown server command: $CMD" >&2
    _usage
    exit 1
    ;;
esac
