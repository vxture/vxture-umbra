#!/usr/bin/env bash
# Certificate lifecycle management.
#
# Usage:
#   bash scripts/deploy-certs.sh              # run renewal check (cron default)
#   bash scripts/deploy-certs.sh --upgrade    # replace self-signed with real LE certs
#   bash scripts/deploy-certs.sh --status     # show cert expiry for all domains
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib/env.sh"
source "$SCRIPT_DIR/lib/log.sh"

MODE="${1:-}"

CERT_DIR="$DATA_DIR/letsencrypt"
WEBROOT="$DATA_DIR/certbot/www"

DOMAINS=(
  "$APEX_DOMAIN" "$WWW_DOMAIN" "$EDGE_DOMAIN" "$SUB_DOMAIN"
  "$CONSOLE_DOMAIN" "$VAULT_DOMAIN" "$STATUS_DOMAIN" "$DOCS_DOMAIN" "$SHORTLINK_DOMAIN"
)

# ── Status mode ───────────────────────────────────────────────────────────────
if [[ "$MODE" == "--status" ]]; then
  log_banner "Umbra — Certificate Status"

  for domain in "${DOMAINS[@]}"; do
    cert_path="$CERT_DIR/live/$domain/fullchain.pem"
    if [[ -f "$cert_path" ]]; then
      expiry=$(openssl x509 -noout -enddate -in "$cert_path" 2>/dev/null | cut -d= -f2 || echo "?")
      expiry_epoch=$(date -d "$expiry" +%s 2>/dev/null || echo 0)
      days_left=$(( (expiry_epoch - $(date +%s)) / 86400 ))
      if (( days_left > 30 )); then
        log_ok "$domain — $days_left days remaining ($expiry)"
      elif (( days_left > 0 )); then
        log_warn "$domain — $days_left days remaining (renew soon)"
      else
        log_fail "$domain — EXPIRED or unreadable"
      fi
    else
      log_warn "$domain — no cert found at $cert_path"
    fi
  done
  exit 0
fi

# ── Upgrade mode: self-signed → real LE certs ────────────────────────────────
if [[ "$MODE" == "--upgrade" ]]; then
  log_banner "Umbra — Upgrade to Real TLS Certificates"

  log_step "Verifying DNS points to this server..."
  SERVER_IP=$(curl -sf --max-time 5 https://api.ipify.org 2>/dev/null \
              || curl -sf --max-time 5 https://ipinfo.io/ip 2>/dev/null \
              || echo "")

  if [[ -z "$SERVER_IP" ]]; then
    log_error "Could not determine server public IP."
    exit 1
  fi

  FAILED=0
  for domain in "${DOMAINS[@]}"; do
    resolved=$(dig +short "$domain" 2>/dev/null | grep -E '^[0-9]+\.' | tail -1 || echo "")
    if [[ "$resolved" != "$SERVER_IP" ]]; then
      log_fail "$domain → $resolved (expected $SERVER_IP)"
      (( ++FAILED ))
    else
      log_ok "$domain → $resolved"
    fi
  done

  if (( FAILED > 0 )); then
    log_error "$FAILED domain(s) not pointing to this server. Fix DNS first."
    exit 1
  fi

  log_step "Removing existing certificates..."
  rm -rf "$CERT_DIR"
  log_ok "Removed old certs"

  log_step "Issuing real Let's Encrypt certificates..."
  CERTBOT_STAGING=false bash "$SCRIPT_DIR/steps/03-issue-certs.sh"

  log_step "Reloading Nginx..."
  docker exec "$NGINX_CONTAINER" nginx -s reload
  log_ok "Nginx reloaded with real certificates"

  log_step "Restarting Marzban (picks up new cert on startup)..."
  if docker compose -f "$REPO_DIR/docker-compose.yml" restart umbra-marzban 2>/dev/null; then
    log_ok "Marzban restarted"
  else
    log_warn "Marzban restart failed — check: docker compose ps"
  fi

  echo ""
  log_ok "TLS upgrade complete. All domains now use trusted certificates."
  exit 0
fi

# ── Default: renewal check (run daily via cron) ───────────────────────────────
log_banner "Umbra — Certificate Renewal"

log_step "Running certbot renew..."
docker run --rm \
  -v "$CERT_DIR:/etc/letsencrypt" \
  -v "$DATA_DIR/certbot/config:/var/lib/letsencrypt" \
  -v "$WEBROOT:/var/www/certbot" \
  certbot/certbot renew \
    --webroot \
    --webroot-path /var/www/certbot \
    --non-interactive \
    --quiet

log_step "Reloading Nginx..."
if docker exec "$NGINX_CONTAINER" nginx -s reload 2>/dev/null; then
  log_ok "Nginx reloaded"
else
  log_warn "Nginx reload failed — container may not be running"
fi

log_step "Restarting Marzban (picks up renewed cert on startup)..."
if docker compose -f "$REPO_DIR/docker-compose.yml" restart umbra-marzban 2>/dev/null; then
  log_ok "Marzban restarted"
else
  log_warn "Marzban restart failed — container may not be running"
fi

log_ok "Certificate renewal check complete."
