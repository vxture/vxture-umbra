#!/usr/bin/env bash
# Server initialization: install Docker, clean up previous deployments.
# Run once on a fresh server, or to reset before re-deploying.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib/log.sh"

log_banner "Umbra — Server Init"

# ── Docker install ────────────────────────────────────────────────────────────
log_step "Checking Docker..."

if ! command -v docker &>/dev/null; then
  log_info "Docker not found — installing..."
  curl -fsSL https://get.docker.com | sh
  log_ok "Docker installed"
else
  log_ok "Docker already installed: $(docker --version)"
fi

if ! docker compose version &>/dev/null; then
  log_info "Installing docker-compose-plugin..."
  apt-get install -y docker-compose-plugin 2>/dev/null || \
    log_warn "Could not install docker-compose-plugin automatically — install manually"
else
  log_ok "docker compose v2: $(docker compose version --short)"
fi

# Ensure current user can run docker
if ! docker info &>/dev/null; then
  log_warn "Docker not accessible without sudo — adding $USER to docker group"
  usermod -aG docker "$USER" 2>/dev/null || true
  log_info "Re-login or run: newgrp docker"
fi

# ── Stop and remove existing umbra containers ─────────────────────────────────
log_step "Cleaning up existing umbra containers..."

UMBRA_CONTAINERS=(
  umbra-nginx umbra-marzban umbra-postgres
  umbra-vaultwarden umbra-uptime umbra-portal umbra-docs umbra-shortlink
)

for c in "${UMBRA_CONTAINERS[@]}"; do
  if docker ps -a --format '{{.Names}}' | grep -q "^${c}$"; then
    docker rm -f "$c" &>/dev/null && log_ok "Removed: $c" || true
  fi
done

# Also remove leftover certbot helper containers
for c in certbot-nginx-tmp; do
  if docker ps -a --format '{{.Names}}' | grep -q "^${c}$"; then
    docker rm -f "$c" &>/dev/null && log_ok "Removed: $c" || true
  fi
done

# Remove umbra network if it exists
if docker network ls --format '{{.Name}}' | grep -q "^umbra_umbra-net$"; then
  docker network rm umbra_umbra-net &>/dev/null && log_ok "Removed network: umbra_umbra-net" || true
fi

log_ok "Container cleanup complete"

# ── Free ports 80 and 443 ─────────────────────────────────────────────────────
log_step "Checking ports 80 and 443..."

for port in 80 443; do
  pid=$(ss -tlnp 2>/dev/null | grep ":${port} " | grep -oP 'pid=\K[0-9]+' | head -1 || echo "")
  if [[ -n "$pid" ]]; then
    proc=$(ps -p "$pid" -o comm= 2>/dev/null || echo "unknown")
    log_warn "Port $port in use by: $proc (pid $pid)"
    read -rp "  Kill process $pid ($proc) to free port $port? [y/N] " answer
    if [[ "${answer,,}" == "y" ]]; then
      kill -9 "$pid" && log_ok "Killed pid $pid" || log_warn "Could not kill $pid"
    fi
  else
    log_ok "Port $port is free"
  fi
done

# ── System packages ───────────────────────────────────────────────────────────
log_step "Ensuring required packages..."

PKGS=()
command -v openssl &>/dev/null || PKGS+=(openssl)
command -v curl    &>/dev/null || PKGS+=(curl)
command -v dig     &>/dev/null || PKGS+=(dnsutils)
command -v python3 &>/dev/null || PKGS+=(python3)

if [[ ${#PKGS[@]} -gt 0 ]]; then
  log_info "Installing: ${PKGS[*]}"
  apt-get update -qq && apt-get install -y "${PKGS[@]}"
  log_ok "Packages installed"
else
  log_ok "All required packages present"
fi

echo ""
log_ok "Server init complete. Ready for deployment."
log_info "Next step: bash scripts/deploy-all.sh"
