#!/usr/bin/env bash
# Issue Let's Encrypt certificates for all domains via Certbot webroot method.
# Requires port 80 to be available and all domains to resolve to this server.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/01-env.sh"
source "$SCRIPT_DIR/../lib/00-log.sh"
source "$SCRIPT_DIR/../lib/02-certs.sh"

if [[ "${1:-}" == "--help" ]] || [[ "${1:-}" == "-h" ]]; then
  echo ""
  echo "  Usage: bash deploy/worker-03/deploy.sh certificates"
  echo ""
  echo "  Issues Let's Encrypt certificates for all configured domains"
  echo "  via Certbot webroot method. Reuses existing valid certs"
  echo "  (>30d remaining). Refuses in-place replacement of bad certs"
  echo "  (use: bash deploy/worker-03/ops.sh certs --upgrade)."
  echo ""
  echo "  Requires port 80 and DNS resolution to this server."
  echo "  Set CERTBOT_STAGING=true for test certs."
  echo "  Set CERTBOT_SKIP=true to skip issuance (self-signed mode)."
  echo ""
  echo "  Called automatically by: bash deploy/worker-03/deploy.sh all"
  echo "  Run standalone:          bash deploy/worker-03/deploy.sh certificates"
  echo ""
  exit 0
fi

log_banner "Umbra - Issue TLS Certificates"

WEBROOT="${CERTBOT_WEBROOT:-$DATA_DIR/certbot/www}"
CERT_DIR="${CERTBOT_CERT_DIR:-$DATA_DIR/letsencrypt}"

mkdir -p "$WEBROOT/.well-known/acme-challenge" "$CERT_DIR" "$DATA_DIR/certbot/config"
# CERT-002: Empty renewal configs are leftovers from failed Certbot runs. They
# are safe to remove and unsafe to renew.
umbra_clean_empty_renewal_configs "$CERT_DIR"

mapfile -t DOMAINS < <(umbra_collect_cert_domains)

remove_domain_state() {
  local domain="$1"

  umbra_validate_cert_domain "$domain" || return 1

  # CERT-003: Domain state removal is allowed only for the current domain and
  # only when the caller explicitly set CERTBOT_REPLACE_UNTRUSTED=true. In normal
  # in-place deploy mode this function is never reached for existing bad certs.
  docker run --rm \
    -v "$CERT_DIR:/etc/letsencrypt" \
    -e DOMAIN="$domain" \
    alpine sh -c '
      set -eu
      rm -rf "/etc/letsencrypt/live/$DOMAIN"
      rm -rf "/etc/letsencrypt/archive/$DOMAIN"
      rm -f  "/etc/letsencrypt/renewal/$DOMAIN.conf"
    '
}

log_step "Starting temporary Nginx for ACME webroot challenge..."

if docker ps -a --format '{{.Names}}' 2>/dev/null | grep -q "^certbot-nginx-tmp$"; then
  docker rm -f certbot-nginx-tmp >/dev/null 2>&1
  log_info "Removed stale certbot-nginx-tmp container"
fi

if docker ps --format '{{.Names}}' | grep -q "^umbra-nginx$"; then
  log_info "umbra-nginx is running; using it for ACME challenge"
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
    docker rm -f certbot-nginx-tmp >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

ISSUED=0
SKIPPED=0
FAILED=0

for domain in "${DOMAINS[@]}"; do
  if ! umbra_validate_cert_domain "$domain"; then
    (( ++FAILED ))
    continue
  fi

  live_path="$CERT_DIR/live/$domain"
  cert_path="$live_path/fullchain.pem"

  if [[ -f "$cert_path" ]]; then
    issuer=$(openssl x509 -noout -issuer -in "$cert_path" 2>/dev/null || echo "")

    # CERT-001: A trusted, non-staging LE certificate is authoritative local
    # state. Reuse it unless it is close to expiry.
    if echo "$issuer" | grep -qi "let's encrypt" && ! echo "$issuer" | grep -qi "staging\|fake"; then
      expiry=$(openssl x509 -noout -enddate -in "$cert_path" 2>/dev/null | cut -d= -f2)
      expiry_epoch=$(date -d "$expiry" +%s 2>/dev/null || date -j -f "%b %d %T %Y %Z" "$expiry" +%s 2>/dev/null || echo 0)
      now_epoch=$(date +%s)
      days_left=$(( (expiry_epoch - now_epoch) / 86400 ))

      if (( days_left > 30 )); then
        log_info "Cert for $domain valid for $days_left days; skipping"
        (( ++SKIPPED ))
        continue
      fi

      log_info "Cert for $domain expires in $days_left days; requesting renewal"
    else
      log_info "Cert for $domain is not a trusted LE cert; replacing"
      if [[ "${CERTBOT_REPLACE_UNTRUSTED:-false}" == "true" ]]; then
        if ! remove_domain_state "$domain"; then
          (( ++FAILED ))
          continue
        fi
      else
        # CERT-003: Never overwrite a bad production cert directory in-place.
        # The staged upgrade path keeps production live while replacement runs.
        log_error "Non-trusted cert already exists in $CERT_DIR for $domain."
        log_info  "Use safe staged replacement: bash deploy/worker-03/ops.sh certs --upgrade"
        (( ++FAILED ))
        continue
      fi
    fi
  elif [[ -e "$live_path" ]]; then
    log_warn "Existing cert directory for $domain has no readable fullchain.pem"
    if [[ "${CERTBOT_REPLACE_UNTRUSTED:-false}" == "true" ]]; then
      if ! remove_domain_state "$domain"; then
        (( ++FAILED ))
        continue
      fi
    else
      # CERT-004: A malformed live directory is also production state. Refuse
      # in-place mutation and force the safer staged flow.
      log_error "Refusing in-place replacement of existing cert directory: $live_path"
      log_info  "Use safe staged replacement: bash deploy/worker-03/ops.sh certs --upgrade"
      (( ++FAILED ))
      continue
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
    log_warn "STAGING mode; cert will not be trusted by browsers"
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
    # CERT-006: Certbot success alone is not enough. Verify the expected file
    # exists and that the issuer is production Let's Encrypt.
    if [[ ! -f "$cert_path" ]]; then
      log_fail "Certbot succeeded but fullchain.pem is missing for $domain"
      umbra_clean_empty_domain_renewal_config "$CERT_DIR" "$domain"
      (( ++FAILED ))
    elif [[ "${CERTBOT_STAGING:-false}" != "true" ]]; then
      issuer=$(openssl x509 -noout -issuer -in "$cert_path" 2>/dev/null || echo "")
      if echo "$issuer" | grep -qi "let's encrypt" && ! echo "$issuer" | grep -qi "staging\|fake"; then
        log_ok "Cert issued for $domain"
        (( ++ISSUED ))
      else
        log_fail "Issued cert for $domain is not a trusted Let's Encrypt cert"
        umbra_clean_empty_domain_renewal_config "$CERT_DIR" "$domain"
        (( ++FAILED ))
      fi
    else
      log_ok "Staging cert issued for $domain"
      (( ++ISSUED ))
    fi
  else
    log_fail "Failed to issue cert for $domain"
    umbra_clean_empty_domain_renewal_config "$CERT_DIR" "$domain"
    (( ++FAILED ))
  fi
done

echo ""
log_info "Certificates: issued=$ISSUED  skipped=$SKIPPED  failed=$FAILED"

if (( FAILED > 0 )); then
  log_error "$FAILED certificate(s) failed to issue."
  log_info  "Check /tmp/certbot-*.log for details."
  log_info  "Ensure DNS records point to this server before retrying."
  exit 1
fi

log_ok "All certificates ready."
