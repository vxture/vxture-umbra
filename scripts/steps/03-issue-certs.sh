#!/usr/bin/env bash
# Issue Let's Encrypt certificates for all domains via Certbot webroot method.
# Requires port 80 to be available and all domains to resolve to this server.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/env.sh"
source "$SCRIPT_DIR/../lib/log.sh"

log_banner "Umbra — Issue TLS Certificates"

WEBROOT="$DATA_DIR/certbot/www"
CERT_DIR="$DATA_DIR/letsencrypt"

DOMAINS=(
  "$APEX_DOMAIN"
  "$WWW_DOMAIN"
  "$EDGE_DOMAIN"
  "$SUB_DOMAIN"
  "$CONSOLE_DOMAIN"
  "$VAULT_DOMAIN"
  "$STATUS_DOMAIN"
  "$DOCS_DOMAIN"
  "$SHORTLINK_DOMAIN"
)

# ── Start temporary Nginx for ACME challenge ──────────────────────────────────
log_step "Starting temporary Nginx for ACME webroot challenge..."

# Clean up any stale container from a previous interrupted run
if docker ps -a --format '{{.Names}}' 2>/dev/null | grep -q "^certbot-nginx-tmp$"; then
  docker rm -f certbot-nginx-tmp &>/dev/null
  log_info "Removed stale certbot-nginx-tmp container"
fi

# If umbra-nginx is already running, use it; otherwise start a temp one
if docker ps --format '{{.Names}}' | grep -q "^umbra-nginx$"; then
  log_info "umbra-nginx is running — using it for ACME challenge"
  TEMP_NGINX=false
else
  log_info "Starting temporary certbot-nginx..."
  docker run -d --name certbot-nginx-tmp \
    -p 80:80 \
    -v "$WEBROOT:/var/www/certbot:ro" \
    nginx:alpine \
    sh -c 'echo "server { listen 80; root /var/www/certbot; }" > /etc/nginx/conf.d/default.conf && nginx -g "daemon off;"'
  TEMP_NGINX=true
  sleep 2
fi

cleanup() {
  if [[ "${TEMP_NGINX:-false}" == "true" ]]; then
    docker rm -f certbot-nginx-tmp &>/dev/null || true
  fi
}
trap cleanup EXIT

# ── Issue cert per domain ─────────────────────────────────────────────────────
ISSUED=0
SKIPPED=0
FAILED=0

for domain in "${DOMAINS[@]}"; do
  cert_path="$CERT_DIR/live/$domain/fullchain.pem"

  if [[ -f "$cert_path" ]]; then
    # Skip only if cert is from a trusted CA AND valid for > 30 days.
    # Self-signed certs (issuer == subject) must always be replaced.
    issuer=$(openssl x509 -noout -issuer -in "$cert_path" 2>/dev/null || echo "")
    subject=$(openssl x509 -noout -subject -in "$cert_path" 2>/dev/null || echo "")
    if [[ "$issuer" == "$subject" ]]; then
      log_info "Cert for $domain is self-signed — replacing with real cert"
    else
      expiry=$(openssl x509 -noout -enddate -in "$cert_path" 2>/dev/null | cut -d= -f2)
      expiry_epoch=$(date -d "$expiry" +%s 2>/dev/null || date -j -f "%b %d %T %Y %Z" "$expiry" +%s 2>/dev/null || echo 0)
      now_epoch=$(date +%s)
      days_left=$(( (expiry_epoch - now_epoch) / 86400 ))

      if (( days_left > 30 )); then
        log_info "Cert for $domain valid for $days_left days — skipping"
        (( ++SKIPPED ))
        continue
      fi
    fi
  fi

  log_step "Issuing cert for: $domain"

  EMAIL_ARG="--email $CERTBOT_EMAIL"
  if [[ -z "$CERTBOT_EMAIL" ]]; then
    EMAIL_ARG="--register-unsafely-without-email"
  fi

  STAGING_ARG=""
  if [[ "${CERTBOT_STAGING:-false}" == "true" ]]; then
    STAGING_ARG="--staging"
    log_warn "STAGING mode — cert will NOT be trusted by browsers (testing only)"
  fi

  if docker run --rm \
    -v "$CERT_DIR:/etc/letsencrypt" \
    -v "$DATA_DIR/certbot/config:/var/lib/letsencrypt" \
    -v "$WEBROOT:/var/www/certbot" \
    certbot/certbot certonly \
      --webroot \
      --webroot-path /var/www/certbot \
      $EMAIL_ARG \
      $STAGING_ARG \
      --agree-tos \
      --non-interactive \
      --no-eff-email \
      -d "$domain"; then
    log_ok "Cert issued for $domain"
    (( ++ISSUED ))
  else
    log_fail "Failed to issue cert for $domain"
    (( ++FAILED ))
  fi
done

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
log_info "Certificates: issued=$ISSUED  skipped=$SKIPPED  failed=$FAILED"

if (( FAILED > 0 )); then
  log_error "$FAILED certificate(s) failed to issue."
  log_info  "Check /tmp/certbot-*.log for details."
  log_info  "Ensure DNS records point to this server before retrying."
  exit 1
fi

log_ok "All certificates ready."
