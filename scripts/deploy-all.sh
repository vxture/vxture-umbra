#!/usr/bin/env bash
# Full deployment: runs all steps in order.
# Safe to re-run — each step is idempotent where possible.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib/env.sh"
source "$SCRIPT_DIR/lib/log.sh"

log_banner "Umbra — Full Deployment"
log_info "Node:    $NODE_NAME"
log_info "Domains: $EDGE_DOMAIN, $SUB_DOMAIN, +7 more"
log_info "Data:    $DATA_DIR"
log_info "Backup:  $BACKUP_DIR"
echo ""

run_step() {
  local step="$1"
  local label="$2"
  log_step "[$step] $label"
  bash "$SCRIPT_DIR/$step" || {
    log_error "Step $step failed. Deployment aborted."
    exit 1
  }
  echo ""
}

run_step "00-check-env.sh"        "Environment check"
run_step "01-init-dirs.sh"        "Initialize directories"
run_step "02-generate-reality.sh" "Generate REALITY keys"

# ── Certificate step: real or self-signed ─────────────────────────────────────
# Set CERTBOT_SKIP=true in .env to use self-signed certs (no DNS required).
# Replace later: rm -rf $DATA_DIR/letsencrypt && bash scripts/03-issue-certs.sh
if [[ "${CERTBOT_SKIP:-false}" == "true" ]]; then
  run_step "03-self-signed.sh"    "Generate self-signed certificates (debug)"
else
  run_step "03-issue-certs.sh"    "Issue TLS certificates"
fi

log_step "[04] Render configuration templates"
python3 "$SCRIPT_DIR/04-render-configs.py" || {
  log_error "Config rendering failed. Deployment aborted."
  exit 1
}
echo ""

run_step "05-up.sh"              "Start Docker services"
run_step "06-verify.sh"          "Verify deployment"
run_step "07-backup.sh"          "Create backup"

# ── Configure cert renewal cron ───────────────────────────────────────────────
log_step "Configuring certificate renewal cron..."

CRON_LINE="17 3 * * * $REPO_DIR/scripts/renew-cert.sh >> /var/log/umbra-cert-renew.log 2>&1"
BACKUP_CRON_LINE="0 2 * * * $REPO_DIR/scripts/07-backup.sh >> /var/log/umbra-backup.log 2>&1"

add_cron() {
  local line="$1"
  if ! crontab -l 2>/dev/null | grep -qF "$line"; then
    ( crontab -l 2>/dev/null; echo "$line" ) | crontab -
    log_ok "Cron added: $line"
  else
    log_info "Cron already exists: $(echo "$line" | cut -c1-60)..."
  fi
}

add_cron "$CRON_LINE"
add_cron "$BACKUP_CRON_LINE"

# ── Console htpasswd ──────────────────────────────────────────────────────────
HTPASSWD_FILE="$DATA_DIR/nginx/private/.htpasswd_console"
CONSOLE_USER="${MARZBAN_ADMIN_USER:-admin}"
CONSOLE_PASS="${CONSOLE_HTPASSWD_PASSWORD:-}"

if [[ ! -f "$HTPASSWD_FILE" ]]; then
  log_step "Creating console Basic Auth credentials..."

  if [[ -z "$CONSOLE_PASS" ]]; then
    log_error "CONSOLE_HTPASSWD_PASSWORD is not set in .env"
    log_error "Add it and re-run, or manually create: htpasswd -c $HTPASSWD_FILE $CONSOLE_USER"
    exit 1
  fi

  if command -v htpasswd &>/dev/null; then
    htpasswd -bc "$HTPASSWD_FILE" "$CONSOLE_USER" "$CONSOLE_PASS"
  else
    # Fallback: generate bcrypt hash via Docker (no host dependency)
    HASH=$(docker run --rm httpd:alpine htpasswd -nbB "$CONSOLE_USER" "$CONSOLE_PASS" | tr -d '\r')
    echo "$HASH" > "$HTPASSWD_FILE"
  fi

  chmod 600 "$HTPASSWD_FILE"
  log_ok "htpasswd_console created for user: $CONSOLE_USER"
else
  log_info "htpasswd_console already exists — skipping"
fi

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
log_banner "Deployment Complete"
log_ok "All services are running."
echo ""
echo "  VPN Portal:    https://$EDGE_DOMAIN"
echo "  Subscriptions: https://$SUB_DOMAIN"
echo "  Console:       https://$CONSOLE_DOMAIN  (VPN access required)"
echo "  Vault:         https://$VAULT_DOMAIN"
echo "  Status:        https://$STATUS_DOMAIN"
echo "  Docs:          https://$DOCS_DOMAIN"
echo "  Short links:   https://$SHORTLINK_DOMAIN"
echo ""
echo "  Next steps:"
echo "  1. Connect to VPN, then open https://$CONSOLE_DOMAIN"
echo "  2. Add users in Marzban and distribute subscription URLs"
echo "  3. Configure monitors in Uptime Kuma: https://$STATUS_DOMAIN"
echo ""
