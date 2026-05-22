#!/usr/bin/env bash
# Server initialization — run once as root on a fresh server.
# Creates admin user, installs Docker, cleans up any previous deployment.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib/log.sh"

log_banner "Umbra — Server Init"

# ── Must run as root ──────────────────────────────────────────────────────────
if [[ "$EUID" -ne 0 ]]; then
  log_error "This script must be run as root"
  exit 1
fi

ADMIN_USER="${ADMIN_USER:-stone}"

# ── System packages ───────────────────────────────────────────────────────────
log_step "Installing required packages..."

apt-get update -qq
PKGS=()
command -v curl    &>/dev/null || PKGS+=(curl)
command -v openssl &>/dev/null || PKGS+=(openssl)
command -v dig     &>/dev/null || PKGS+=(dnsutils)
command -v python3 &>/dev/null || PKGS+=(python3)
command -v git     &>/dev/null || PKGS+=(git)
dpkg -l htpasswd &>/dev/null 2>&1 || PKGS+=(apache2-utils)

if [[ ${#PKGS[@]} -gt 0 ]]; then
  apt-get install -y "${PKGS[@]}" -qq
  log_ok "Installed: ${PKGS[*]}"
else
  log_ok "All required packages already present"
fi

# ── Docker ────────────────────────────────────────────────────────────────────
log_step "Checking Docker..."

if ! command -v docker &>/dev/null; then
  log_info "Installing Docker..."
  curl -fsSL https://get.docker.com | sh
  log_ok "Docker installed: $(docker --version)"
else
  log_ok "Docker: $(docker --version)"
fi

if ! docker compose version &>/dev/null; then
  apt-get install -y docker-compose-plugin -qq
  log_ok "docker compose plugin installed"
else
  log_ok "docker compose v2: $(docker compose version --short)"
fi

# ── Admin user ────────────────────────────────────────────────────────────────
log_step "Setting up admin user: $ADMIN_USER ..."

if id "$ADMIN_USER" &>/dev/null; then
  log_info "User $ADMIN_USER already exists — skipping creation"
else
  useradd -m -s /bin/bash "$ADMIN_USER"
  log_ok "User created: $ADMIN_USER"
fi

# Groups: sudo + docker
usermod -aG sudo   "$ADMIN_USER"
usermod -aG docker "$ADMIN_USER"
log_ok "$ADMIN_USER added to: sudo, docker"

# Copy root SSH authorized_keys so existing SSH key still works
if [[ -f /root/.ssh/authorized_keys ]]; then
  mkdir -p "/home/$ADMIN_USER/.ssh"
  cp /root/.ssh/authorized_keys "/home/$ADMIN_USER/.ssh/authorized_keys"
  chown -R "$ADMIN_USER:$ADMIN_USER" "/home/$ADMIN_USER/.ssh"
  chmod 700 "/home/$ADMIN_USER/.ssh"
  chmod 600 "/home/$ADMIN_USER/.ssh/authorized_keys"
  log_ok "SSH authorized_keys copied from root"
else
  log_warn "No /root/.ssh/authorized_keys found — add your public key manually:"
  log_warn "  echo '<your-pubkey>' >> /home/$ADMIN_USER/.ssh/authorized_keys"
fi

# ── Directory ownership ───────────────────────────────────────────────────────
log_step "Setting up /srv/vxture ..."

mkdir -p /srv/vxture/repo
chown -R "$ADMIN_USER:$ADMIN_USER" /srv/vxture
log_ok "/srv/vxture owned by $ADMIN_USER"

# ── Harden SSH: disable root login ───────────────────────────────────────────
log_step "Hardening SSH..."

SSHD_CONF="/etc/ssh/sshd_config"
if grep -q "^PermitRootLogin yes" "$SSHD_CONF" 2>/dev/null; then
  sed -i 's/^PermitRootLogin yes/PermitRootLogin no/' "$SSHD_CONF"
  log_ok "PermitRootLogin → no"
elif grep -q "^PermitRootLogin" "$SSHD_CONF" 2>/dev/null; then
  log_info "PermitRootLogin already configured: $(grep '^PermitRootLogin' "$SSHD_CONF")"
else
  echo "PermitRootLogin no" >> "$SSHD_CONF"
  log_ok "PermitRootLogin no — added"
fi

systemctl reload sshd
log_ok "sshd reloaded"

# ── Clean up existing umbra containers ───────────────────────────────────────
log_step "Cleaning up existing umbra containers..."

UMBRA_CONTAINERS=(
  umbra-nginx umbra-marzban umbra-postgres
  umbra-vaultwarden umbra-uptime umbra-portal umbra-docs umbra-shortlink
  certbot-nginx-tmp
)

for c in "${UMBRA_CONTAINERS[@]}"; do
  if docker ps -a --format '{{.Names}}' | grep -q "^${c}$"; then
    docker rm -f "$c" &>/dev/null
    log_ok "Removed container: $c"
  fi
done

if docker network ls --format '{{.Name}}' | grep -q "^umbra_umbra-net$"; then
  docker network rm umbra_umbra-net &>/dev/null
  log_ok "Removed network: umbra_umbra-net"
fi

# ── Free ports 80 / 443 ───────────────────────────────────────────────────────
log_step "Freeing ports 80 and 443..."

for port in 80 443; do
  pid=$(ss -tlnp 2>/dev/null | grep ":${port} " | grep -oP 'pid=\K[0-9]+' | head -1 || echo "")
  if [[ -n "$pid" ]]; then
    proc=$(ps -p "$pid" -o comm= 2>/dev/null || echo "unknown")
    log_warn "Port $port occupied by $proc (pid $pid) — killing"
    kill -9 "$pid" && log_ok "Freed port $port" || log_warn "Could not free port $port"
  else
    log_ok "Port $port is free"
  fi
done

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
log_banner "Server Init Complete"
log_ok "Admin user:  $ADMIN_USER  (sudo + docker)"
log_ok "SSH:         root login disabled"
log_ok "Docker:      $(docker --version | cut -d' ' -f3 | tr -d ',')"
log_ok "Data dir:    /srv/vxture (owned by $ADMIN_USER)"
echo ""
log_info "Next steps (run as $ADMIN_USER):"
log_info "  1. SSH in as $ADMIN_USER to verify access"
log_info "  2. cd /srv/vxture/repo/umbra"
log_info "  3. cp .env.example .env && nano .env"
log_info "  4. bash scripts/deploy-all.sh"
