#!/usr/bin/env bash
# Check all prerequisites before deployment
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib/env.sh"
source "$SCRIPT_DIR/lib/log.sh"

log_banner "Umbra — Environment Check"

ERRORS=0
fail() { log_fail "$1"; ((ERRORS++)); }

# ── Required variables ────────────────────────────────────────────────────────
log_step "Checking required environment variables..."

REQUIRED_VARS=(
  PROJECT_NAME NODE_NAME
  REPO_DIR DATA_DIR BACKUP_DIR
  APEX_DOMAIN WWW_DOMAIN EDGE_DOMAIN SUB_DOMAIN
  CONSOLE_DOMAIN VAULT_DOMAIN STATUS_DOMAIN DOCS_DOMAIN SHORTLINK_DOMAIN
  REALITY_SNI REALITY_DEST XRAY_INTERNAL_PORT
  MARZBAN_ADMIN_USER MARZBAN_ADMIN_PASSWORD CONSOLE_HTPASSWD_PASSWORD
  SUBSCRIPTION_URL_PREFIX
  POSTGRES_PASSWORD POSTGRES_MARZBAN_PASSWORD
  POSTGRES_VAULTWARDEN_PASSWORD POSTGRES_SHLINK_PASSWORD
  VAULTWARDEN_ADMIN_TOKEN
  CERTBOT_EMAIL
)

for var in "${REQUIRED_VARS[@]}"; do
  val="${!var:-}"
  if [[ -z "$val" ]]; then
    fail "Missing required variable: $var"
  else
    log_ok "$var is set"
  fi
done

# ── Docker ────────────────────────────────────────────────────────────────────
log_step "Checking Docker..."

if ! docker info &>/dev/null; then
  fail "Docker is not running or current user lacks access (try: sudo usermod -aG docker \$USER)"
else
  log_ok "Docker is available"
fi

if ! docker compose version &>/dev/null; then
  fail "docker compose v2 not found (install: apt install docker-compose-plugin)"
else
  log_ok "docker compose v2: $(docker compose version --short)"
fi

# ── DNS resolution ────────────────────────────────────────────────────────────
log_step "Checking DNS resolution..."

PUBLIC_IP=$(curl -sf --max-time 5 https://api.ipify.org 2>/dev/null \
            || curl -sf --max-time 5 https://ipinfo.io/ip 2>/dev/null \
            || echo "")

if [[ -z "$PUBLIC_IP" ]]; then
  log_warn "Could not determine public IP — skipping DNS validation"
else
  log_info "Server public IP: $PUBLIC_IP"
  DOMAINS=(
    "$APEX_DOMAIN" "$WWW_DOMAIN" "$EDGE_DOMAIN" "$SUB_DOMAIN"
    "$CONSOLE_DOMAIN" "$VAULT_DOMAIN" "$STATUS_DOMAIN" "$DOCS_DOMAIN" "$SHORTLINK_DOMAIN"
  )
  for domain in "${DOMAINS[@]}"; do
    resolved=$(dig +short "$domain" 2>/dev/null | grep -E '^[0-9]+\.' | tail -1 || echo "")
    if [[ "$resolved" == "$PUBLIC_IP" ]]; then
      log_ok "$domain → $resolved"
    elif [[ -z "$resolved" ]]; then
      fail "$domain → (no A record found)"
    else
      log_warn "$domain → $resolved (expected $PUBLIC_IP) — update DNS before issuing certs"
    fi
  done
fi

# ── Port availability ─────────────────────────────────────────────────────────
log_step "Checking port availability..."

NGINX_CONTAINER="${NGINX_CONTAINER:-umbra-nginx}"
for port in 80 443; do
  if ss -tlnp 2>/dev/null | grep -q ":$port "; then
    # Port in use — OK if it's our own nginx container
    if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^${NGINX_CONTAINER}$"; then
      log_ok "Port $port in use by $NGINX_CONTAINER (expected)"
    else
      fail "Port $port is already in use — stop the conflicting service first"
    fi
  else
    log_ok "Port $port is free"
  fi
done

# ── Result ────────────────────────────────────────────────────────────────────
echo ""
if [[ $ERRORS -gt 0 ]]; then
  log_error "$ERRORS check(s) failed. Fix the issues above, then re-run."
  exit 1
fi
log_ok "All checks passed. Ready to deploy."
