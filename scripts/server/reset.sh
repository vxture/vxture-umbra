#!/usr/bin/env bash
# Reset this server's Umbra deployment.
#
# Default (soft): stops containers and frees ports for a clean re-deploy.
#   Data and certs are preserved.
#
# --full: destroys all runtime data including databases, certs, and keys.
#   Requires typing YES to confirm. Use before reprovisioning from scratch.
#
# Usage:
#   bash scripts/server.sh reset           # soft: stop containers only
#   bash scripts/server.sh reset --full    # destructive: destroy runtime data
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/env.sh"
source "$SCRIPT_DIR/../lib/log.sh"

MODE="${1:-}"
CONTAINERS=(umbra-nginx umbra-marzban umbra-vaultwarden umbra-portal certbot-nginx-tmp)
PORTS=(80 443)

container_state() {
  local name="$1"
  local names
  local state

  if ! names="$(docker ps -a --format '{{.Names}}' 2>/dev/null)"; then
    echo "unknown"
    return 0
  fi

  if ! printf '%s\n' "$names" | grep -Fxq "$name"; then
    echo "absent"
    return 0
  fi

  state="$(docker inspect "$name" --format '{{.State.Status}}' 2>/dev/null || true)"
  state="$(printf '%s' "$state" | sed '/^[[:space:]]*$/d' | tail -1 | tr -d '\r')"

  if [[ -z "$state" ]]; then
    echo "unknown"
  else
    echo "$state"
  fi
}

port_owner() {
  local port="$1"
  ss -tlnp 2>/dev/null | grep ":${port} " | head -1 || true
}

resolve_reset_target() {
  local target="$1"
  local resolved root_resolved repo_resolved

  if [[ -z "$target" || "$target" == "/" ]]; then
    log_error "Refusing unsafe reset target: ${target:-<empty>}"
    return 1
  fi

  resolved="$(realpath -m "$target")"
  root_resolved="$(realpath -m "${ROOT_DIR:-/srv/vxture}")"
  repo_resolved="$(realpath -m "$REPO_DIR")"

  case "$resolved" in
    "$root_resolved"/*) ;;
    *)
      log_error "Refusing reset target outside ROOT_DIR: $resolved"
      return 1
      ;;
  esac

  if [[ "$resolved" == "$root_resolved" ]] \
     || [[ "$resolved" == "$repo_resolved" ]] \
     || [[ "$resolved" == "$repo_resolved"/* ]]; then
    log_error "Refusing reset target that would remove root or repo state: $resolved"
    return 1
  fi

  printf '%s\n' "$resolved"
}

stop_containers() {
  log_step "Stopping Umbra containers..."
  cd "$REPO_DIR"
  docker compose down --remove-orphans 2>/dev/null && log_ok "Compose containers stopped" || true

  for c in certbot-nginx-tmp; do
    if docker ps -a --format '{{.Names}}' | grep -q "^${c}$"; then
      docker rm -f "$c" >/dev/null 2>&1 && log_ok "Removed stale container: $c"
    fi
  done
}

free_ports() {
  log_step "Freeing ports 80 and 443..."
  for port in "${PORTS[@]}"; do
    pid=$(ss -tlnp 2>/dev/null | grep ":${port} " | grep -oP 'pid=\K[0-9]+' | head -1 || echo "")
    if [[ -n "$pid" ]]; then
      proc=$(ps -p "$pid" -o comm= 2>/dev/null || echo "unknown")
      if [[ "${FORCE_FREE_PORTS:-false}" == "true" ]]; then
        if kill -9 "$pid" 2>/dev/null; then
          log_ok "Freed port $port (killed $proc pid=$pid)"
        else
          log_warn "Could not kill $proc pid=$pid on port $port"
        fi
      else
        log_warn "Port $port is still used by $proc pid=$pid; not killing automatically"
        log_warn "Set FORCE_FREE_PORTS=true only if this process is safe to terminate"
      fi
    else
      log_ok "Port $port is free"
    fi
  done
}

verify_runtime_stopped() {
  local failures=0
  local state owner

  log_info "Containers"
  for c in "${CONTAINERS[@]}"; do
    state="$(container_state "$c")"
    case "$state" in
      absent)
        log_ok "$c: absent"
        ;;
      exited|created|dead)
        log_ok "$c: not running ($state)"
        ;;
      *)
        log_fail "$c: still $state"
        (( ++failures ))
        ;;
    esac
  done

  log_info "Ports"
  for port in "${PORTS[@]}"; do
    owner="$(port_owner "$port")"
    if [[ -z "$owner" ]]; then
      log_ok "Port $port: free"
    else
      log_fail "Port $port: still in use ($owner)"
      (( ++failures ))
    fi
  done

  return "$failures"
}

verify_soft_reset() {
  local failures=0

  if ! verify_runtime_stopped; then
    failures=$(( failures + 1 ))
  fi

  log_info "Preserved data"
  if [[ -d "$DATA_DIR" ]]; then
    log_ok "DATA_DIR preserved: $DATA_DIR"
  else
    log_warn "DATA_DIR is absent: $DATA_DIR"
  fi

  if [[ -d "$BACKUP_DIR" ]]; then
    log_ok "BACKUP_DIR preserved: $BACKUP_DIR"
  else
    log_warn "BACKUP_DIR is absent: $BACKUP_DIR"
  fi

  if (( failures > 0 )); then
    log_error "Soft reset finished with verification failures."
    return 1
  fi

  log_ok "Soft reset verified. Data was not removed."
}

verify_full_reset() {
  local failures=0

  if ! verify_runtime_stopped; then
    failures=$(( failures + 1 ))
  fi

  log_info "Removed data"
  for target_dir in "$DATA_DIR" "$BACKUP_DIR"; do
    if [[ -e "$target_dir" ]]; then
      log_fail "Still exists: $target_dir"
      (( ++failures ))
    else
      log_ok "Removed: $target_dir"
    fi
  done

  if (( failures > 0 )); then
    log_error "Full reset finished with verification failures."
    return 1
  fi

  log_ok "Full reset verified. Runtime data is removed."
}

if [[ "$MODE" == "--full" ]]; then
  log_banner "Umbra - Full Reset"
  echo ""
  log_warn "This will permanently destroy:"
  log_warn "  DATA_DIR   : $DATA_DIR"
  log_warn "  BACKUP_DIR : $BACKUP_DIR"
  log_warn ""
  log_warn "All databases, certificates, REALITY keys, and rendered configs will be lost."
  echo ""

  if [[ -t 0 ]]; then
    read -r -p "  Type YES to confirm full reset: " confirm
  else
    confirm=""
  fi

  if [[ "$confirm" != "YES" ]]; then
    log_info "Aborted; no changes made."
    exit 0
  fi

  log_step "Execution phase"
  stop_containers
  free_ports

  log_step "Removing all runtime data..."
  for target_dir in "$DATA_DIR" "$BACKUP_DIR"; do
    resolved_target="$(resolve_reset_target "$target_dir")" || exit 1
    if [[ -d "$resolved_target" ]]; then
      docker run --rm -v "$resolved_target:/target" alpine sh -c 'rm -rf /target/*' 2>/dev/null || true
      if rm -rf -- "$resolved_target"; then
        log_ok "Remove attempted: $resolved_target"
      else
        log_warn "Remove failed; verification will report this path: $resolved_target"
      fi
    else
      log_info "Already absent: $resolved_target"
    fi
  done

  echo ""
  log_step "Verification phase"
  verify_full_reset
  echo ""
  log_info "To redeploy from scratch:"
  log_info "  bash scripts/deploy.sh all"
  exit 0
fi

if [[ -n "$MODE" ]]; then
  log_error "Unknown reset mode: $MODE"
  log_info "Usage: bash scripts/server.sh reset [--full]"
  exit 1
fi

log_banner "Umbra - Soft Reset"
log_info "Stops containers and frees ports. Data and certs are preserved."
echo ""

log_step "Execution phase"
stop_containers
free_ports

echo ""
log_step "Verification phase"
verify_soft_reset
echo ""
log_info "To redeploy:"
log_info "  bash scripts/deploy.sh all"
