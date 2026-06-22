#!/usr/bin/env bash
# Load .env into environment if not already loaded

_ENV_LOADED="${_UMBRA_ENV_LOADED:-0}"
if [[ "$_ENV_LOADED" == "0" ]]; then
  _UMBRA_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  DEPLOY_DIR="$(cd "$_UMBRA_LIB_DIR/.." && pwd)"
  # lib/ sits under the DISPOSABLE deploy dir (CI rsyncs it fresh each release).
  # The operator .env is NOT kept there; it lives under the persistent root at
  # $PROJECT_ROOT/etc/.env (PROJECT_ROOT = the /srv/umbra root, lib/../..).
  PROJECT_ROOT="$(cd "$_UMBRA_LIB_DIR/../.." && pwd)"

  if [[ -f "$PROJECT_ROOT/etc/.env" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$PROJECT_ROOT/etc/.env"
    if [[ -f "$DEPLOY_DIR/.env" ]]; then
      # shellcheck disable=SC1090
      source "$DEPLOY_DIR/.env"
    fi
    set +a
    export _UMBRA_ENV_LOADED=1
  else
    echo "[ERROR] .env not found at $PROJECT_ROOT/etc/.env" >&2
    echo "        Copy .env.example to $PROJECT_ROOT/etc/.env and fill in your values." >&2
    exit 1
  fi
fi
