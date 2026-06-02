#!/usr/bin/env bash
# Check all prerequisites before deployment.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/01-env.sh"
source "$SCRIPT_DIR/../lib/00-log.sh"
source "$SCRIPT_DIR/../lib/02-certs.sh"

if [[ "${1:-}" == "--help" ]] || [[ "${1:-}" == "-h" ]]; then
  echo ""
  echo "  Usage: bash deploy/worker-03/deploy.sh environment"
  echo ""
  echo "  Validates all environment variables, Docker availability, DNS"
  echo "  resolution, and port availability before deployment."
  echo ""
  echo "  Called automatically by: bash deploy/worker-03/deploy.sh all"
  echo "  Run standalone:          bash deploy/worker-03/deploy.sh environment"
  echo ""
  exit 0
fi

log_banner "Umbra - Environment Check"

ERRORS=0
fail() { log_fail "$1"; (( ++ERRORS )); }

require_bool() {
  local name="$1"
  local value="${!name:-}"
  if [[ "$value" =~ ^(true|false)$ ]]; then
    log_ok "$name is boolean"
  else
    fail "$name must be true or false"
  fi
}

require_int_range() {
  local name="$1"
  local min="$2"
  local max="$3"
  local value="${!name:-}"
  if [[ "$value" =~ ^[0-9]+$ ]] && (( 10#$value >= min && 10#$value <= max )); then
    log_ok "$name is in range $min-$max"
  else
    fail "$name must be an integer in range $min-$max"
  fi
}

# -- Required variables --------------------------------------------------------
log_step "Checking required environment variables..."

REQUIRED_VARS=(
  PROJECT_NAME NODE_NAME
  ROOT_DIR REPO_DIR DATA_DIR BACKUP_DIR
  APEX_DOMAIN WWW_DOMAIN EDGE_DOMAIN SUB_DOMAIN
  CONSOLE_DOMAIN ADMIN_DOMAIN PASS_DOMAIN
  REALITY_SNI REALITY_DEST XRAY_INTERNAL_PORT REALITY_SHORT_ID_LENGTH
  MARZBAN_ADMIN_USER MARZBAN_ADMIN_PASSWORD
  MARZBAN_SSL_CA_TYPE SUBSCRIPTION_URL_PREFIX
  SUB_PROFILE_PREFIX SUB_PROFILE_TITLE
  ACCOUNT_SESSION_SECRET ACCOUNT_INVITE_SECRET ACCOUNT_INVITE_TTL_DAYS
  JWT_SECRET AUTH_BFF_URL AUTH_INTERNAL_TOKEN VXTURE_LOGIN_URL
  VAULTWARDEN_ADMIN_TOKEN
  CERTBOT_EMAIL CERTBOT_STAGING CERTBOT_SKIP
  USER_COUNT USER_PREFIX
  NGINX_CONTAINER VXTURE_NPM_REGISTRY
)

for var in "${REQUIRED_VARS[@]}"; do
  val="${!var:-}"
  if [[ -z "$val" ]]; then
    fail "Missing required variable: $var"
  else
    log_ok "$var is set"
  fi
done

# -- Value validation ----------------------------------------------------------
log_step "Checking environment value formats..."

for domain_var in APEX_DOMAIN WWW_DOMAIN EDGE_DOMAIN SUB_DOMAIN CONSOLE_DOMAIN ADMIN_DOMAIN PASS_DOMAIN REALITY_SNI; do
  if umbra_validate_cert_domain "${!domain_var:-}"; then
    log_ok "$domain_var is a valid domain"
  else
    fail "$domain_var is not a valid domain"
  fi
done

require_int_range XRAY_INTERNAL_PORT 1 65535
require_int_range USER_COUNT 1 9999
require_int_range ACCOUNT_INVITE_TTL_DAYS 1 3650

if [[ "${REALITY_SHORT_ID_LENGTH:-}" =~ ^[0-9]+$ ]] && (( 10#$REALITY_SHORT_ID_LENGTH > 0 && 10#$REALITY_SHORT_ID_LENGTH % 2 == 0 )); then
  log_ok "REALITY_SHORT_ID_LENGTH is a positive even integer"
else
  fail "REALITY_SHORT_ID_LENGTH must be a positive even integer"
fi

if [[ "${MARZBAN_SSL_CA_TYPE:-}" =~ ^(public|private)$ ]]; then
  log_ok "MARZBAN_SSL_CA_TYPE is valid"
else
  fail "MARZBAN_SSL_CA_TYPE must be public or private"
fi

require_bool CERTBOT_STAGING
require_bool CERTBOT_SKIP

if [[ "${SUBSCRIPTION_URL_PREFIX:-}" == "https://${SUB_DOMAIN}" ]]; then
  log_ok "SUBSCRIPTION_URL_PREFIX matches SUB_DOMAIN"
else
  fail "SUBSCRIPTION_URL_PREFIX must be https://${SUB_DOMAIN}"
fi

if [[ "${SUB_PROFILE_PREFIX:-}" =~ ^[A-Za-z0-9._-]+$ ]]; then
  log_ok "SUB_PROFILE_PREFIX is client-safe"
else
  fail "SUB_PROFILE_PREFIX must contain only letters, numbers, dots, underscores, or hyphens"
fi

account_session_secret="${ACCOUNT_SESSION_SECRET:-}"
if [[ "${#account_session_secret}" -ge 32 ]]; then
  log_ok "ACCOUNT_SESSION_SECRET length is valid"
else
  fail "ACCOUNT_SESSION_SECRET must be at least 32 characters"
fi

account_invite_secret="${ACCOUNT_INVITE_SECRET:-}"
if [[ "${#account_invite_secret}" -ge 32 ]]; then
  log_ok "ACCOUNT_INVITE_SECRET length is valid"
else
  fail "ACCOUNT_INVITE_SECRET must be at least 32 characters"
fi

jwt_secret="${JWT_SECRET:-}"
if [[ "${#jwt_secret}" -ge 32 ]]; then
  log_ok "JWT_SECRET length is valid"
else
  fail "JWT_SECRET must be at least 32 characters and match Vxture auth-bff"
fi

auth_internal_token="${AUTH_INTERNAL_TOKEN:-}"
if [[ "${#auth_internal_token}" -ge 32 ]]; then
  log_ok "AUTH_INTERNAL_TOKEN length is valid"
else
  fail "AUTH_INTERNAL_TOKEN must be at least 32 characters and match Vxture auth-bff"
fi

if [[ "${AUTH_BFF_URL:-}" =~ ^https?://[^[:space:]]+$ ]]; then
  log_ok "AUTH_BFF_URL is valid"
else
  fail "AUTH_BFF_URL must be an http(s) URL"
fi

if [[ "${VXTURE_LOGIN_URL:-}" =~ ^https?://[^[:space:]]+$ ]]; then
  log_ok "VXTURE_LOGIN_URL is valid"
else
  fail "VXTURE_LOGIN_URL must be an http(s) URL"
fi

if [[ "${VXTURE_NPM_REGISTRY:-}" =~ ^https?://[^[:space:]]+$ ]]; then
  log_ok "VXTURE_NPM_REGISTRY is valid"
else
  fail "VXTURE_NPM_REGISTRY must be an http(s) URL"
fi

if [[ "${VXTURE_NPM_REGISTRY:-}" == *"npm.pkg.github.com"* ]]; then
  if [[ -n "${NODE_AUTH_TOKEN:-}" ]]; then
    log_ok "NODE_AUTH_TOKEN is set for GitHub Packages"
  else
    fail "NODE_AUTH_TOKEN is required when VXTURE_NPM_REGISTRY uses GitHub Packages"
  fi
fi

if [[ -z "${VXTURE_SSO_URL:-}" ]]; then
  log_ok "VXTURE_SSO_URL is empty; fallback login remains enabled"
elif [[ "${VXTURE_SSO_URL:-}" =~ ^https?://[^[:space:]]+$ ]]; then
  log_ok "VXTURE_SSO_URL is valid"
else
  fail "VXTURE_SSO_URL must be empty or an http(s) URL"
fi

if [[ "${REALITY_DEST:-}" =~ ^([^[:space:]:]+):([0-9]+)$ ]] && (( 10#${BASH_REMATCH[2]} >= 1 && 10#${BASH_REMATCH[2]} <= 65535 )); then
  log_ok "REALITY_DEST has host:port format"
else
  fail "REALITY_DEST must be host:port with port in range 1-65535"
fi

# -- Docker --------------------------------------------------------------------
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

# -- DNS resolution ------------------------------------------------------------
log_step "Checking DNS resolution..."

PUBLIC_IP=$(curl -sf --max-time 5 https://api.ipify.org 2>/dev/null \
            || curl -sf --max-time 5 https://ipinfo.io/ip 2>/dev/null \
            || echo "")

if [[ -z "$PUBLIC_IP" ]]; then
  log_warn "Could not determine public IP - skipping DNS validation"
else
  log_info "Server public IP: $PUBLIC_IP"
  mapfile -t DOMAINS < <(umbra_collect_cert_domains)
  for domain in "${DOMAINS[@]}"; do
    resolved=$(dig +short "$domain" 2>/dev/null | grep -E '^[0-9]+\.' | tail -1 || echo "")
    if [[ "$resolved" == "$PUBLIC_IP" ]]; then
      log_ok "$domain -> $resolved"
    elif [[ -z "$resolved" ]]; then
      fail "$domain -> (no A record found)"
    elif [[ "${CERTBOT_SKIP:-false}" == "true" ]]; then
      log_warn "$domain -> $resolved (expected $PUBLIC_IP) - OK, self-signed mode"
    else
      fail "$domain -> $resolved (expected $PUBLIC_IP) - fix DNS or set CERTBOT_SKIP=true"
    fi
  done
fi

# -- Port availability ---------------------------------------------------------
log_step "Checking port availability..."

NGINX_CONTAINER="${NGINX_CONTAINER:-umbra-nginx}"
for port in 80 443; do
  if ss -tlnp 2>/dev/null | grep -q ":$port "; then
    # Port in use is OK only when it belongs to the Umbra nginx container.
    if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^${NGINX_CONTAINER}$"; then
      log_ok "Port $port in use by $NGINX_CONTAINER (expected)"
    else
      fail "Port $port is already in use - stop the conflicting service first"
    fi
  else
    log_ok "Port $port is free"
  fi
done

# -- Result -------------------------------------------------------------------
echo ""
if [[ $ERRORS -gt 0 ]]; then
  log_error "$ERRORS check(s) failed. Fix the issues above, then re-run."
  exit 1
fi
log_ok "All checks passed. Ready to deploy."
