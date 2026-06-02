#!/usr/bin/env bash
# Compatibility wrapper. Prefer: bash deploy/worker-03/server.sh init "$@"
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec bash "$SCRIPT_DIR/../server.sh" init "$@"
