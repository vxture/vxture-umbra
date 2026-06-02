#!/usr/bin/env bash
# Compatibility wrapper. Prefer: bash deploy/worker-03/deploy.sh wizard "$@"
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec bash "$SCRIPT_DIR/../deploy.sh" wizard "$@"
