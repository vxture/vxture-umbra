#!/usr/bin/env bash
# Certificate lifecycle management.
#
# Usage:
#   bash scripts/ops.sh certs --renew      # run renewal check (cron default)
#   bash scripts/ops.sh certs --upgrade    # replace self-signed with real LE certs
#   bash scripts/ops.sh certs --status     # show cert expiry for all domains
#   bash scripts/ops.sh certs --clean-renewal-state
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/env.sh"
source "$SCRIPT_DIR/../lib/log.sh"
source "$SCRIPT_DIR/../lib/certs.sh"

MODE="${1:-}"

CERT_DIR="$DATA_DIR/letsencrypt"
WEBROOT="$DATA_DIR/certbot/www"

DOMAINS=(
  "$APEX_DOMAIN" "$WWW_DOMAIN" "$EDGE_DOMAIN" "$SUB_DOMAIN"
  "$CONSOLE_DOMAIN" "$PASS_DOMAIN" "$VAULT_DOMAIN"
)

validate_domains() {
  local failed=0
  local domain

  for domain in "${DOMAINS[@]}"; do
    umbra_validate_cert_domain "$domain" || (( ++failed ))
  done

  (( failed == 0 ))
}

sync_marzban_tls() {
  umbra_sync_marzban_tls "$CERT_DIR" "$EDGE_DOMAIN" "$DATA_DIR/marzban/tls"
}

report_empty_renewal_configs() {
  local empty
  empty="$(umbra_list_empty_renewal_configs "$CERT_DIR")"
  if [[ -z "$empty" ]]; then
    return 0
  fi

  log_warn "Empty Certbot renewal configs found. They are invalid and should not be renewed:"
  while IFS= read -r path; do
    [[ -n "$path" ]] && log_warn "  ${path#/certs/}"
  done <<< "$empty"
}

prepare_staged_certs() {
  local staged_name="$1"

  docker run --rm \
    -v "$DATA_DIR:/data" \
    -e STAGED_NAME="$staged_name" \
    alpine sh -c '
      set -eu
      staged="/data/$STAGED_NAME"

      if [ -d "$staged" ]; then
        echo "Reusing existing staged certificate directory: $staged"
      elif [ -d /data/letsencrypt ]; then
        cp -a /data/letsencrypt "$staged"
      else
        mkdir -p "$staged"
      fi

      for dir in "$staged/live" "$staged/archive" "$staged/renewal"; do
        if [ -d "$dir" ]; then
          find "$dir" -type d -exec chmod a+rx {} +
        fi
      done
    '
}

activate_staged_certs() {
  local staged_name="$1"
  local backup_name="$2"

  docker run --rm \
    -v "$DATA_DIR:/data" \
    -e STAGED_NAME="$staged_name" \
    -e BACKUP_NAME="$backup_name" \
    alpine sh -c '
      set -eu
      current="/data/letsencrypt"
      staged="/data/$STAGED_NAME"
      backup="/data/$BACKUP_NAME"

      if [ ! -d "$staged/live" ]; then
        echo "Staged certificate directory is incomplete: $staged" >&2
        exit 1
      fi

      rm -rf "$backup"
      if [ -d "$current" ]; then
        mv "$current" "$backup"
      fi

      if ! mv "$staged" "$current"; then
        rm -rf "$current"
        if [ -d "$backup" ]; then
          mv "$backup" "$current"
        fi
        exit 1
      fi
    '
}

restore_backup_certs() {
  local backup_name="$1"
  local failed_name="$2"

  docker run --rm \
    -v "$DATA_DIR:/data" \
    -e BACKUP_NAME="$backup_name" \
    -e FAILED_NAME="$failed_name" \
    alpine sh -c '
      set -eu
      current="/data/letsencrypt"
      backup="/data/$BACKUP_NAME"
      failed="/data/$FAILED_NAME"

      if [ ! -d "$backup" ]; then
        echo "Backup certificate directory does not exist: $backup" >&2
        exit 1
      fi

      rm -rf "$failed"
      if [ -d "$current" ]; then
        mv "$current" "$failed"
      fi
      mv "$backup" "$current"
    '
}

if [[ "$MODE" == "--clean-renewal-state" ]]; then
  log_banner "Umbra - Clean Certbot Renewal State"
  validate_domains || exit 1
  log_info "Only zero-byte renewal configs are removed. Certificates are not issued or deleted."
  umbra_clean_empty_renewal_configs "$CERT_DIR"
  log_ok "Renewal state cleanup complete."
  exit 0
fi

if [[ "$MODE" == "--status" ]]; then
  log_banner "Umbra - Certificate Status"
  validate_domains || exit 1
  log_info "Reading certs inside Docker so root-owned certbot files are visible."
  report_empty_renewal_configs

  if [[ ! -d "$CERT_DIR" ]]; then
    log_warn "Certificate directory does not exist: $CERT_DIR"
    exit 0
  fi

  if ! docker run --rm \
    --entrypoint python \
    -v "$CERT_DIR:/certs:ro" \
    -e DOMAINS="${DOMAINS[*]}" \
    certbot/certbot \
    -c '
import datetime
import os
import ssl

domains = os.environ["DOMAINS"].split()
now = datetime.datetime.now(datetime.timezone.utc)

def flatten_name(name):
    return ", ".join("=".join(part) for rdn in name for part in rdn)

for domain in domains:
    path = f"/certs/live/{domain}/fullchain.pem"
    try:
        cert = ssl._ssl._test_decode_cert(path)
        expiry_text = cert["notAfter"]
        issuer = flatten_name(cert.get("issuer", ()))
        expiry = datetime.datetime.strptime(
            expiry_text, "%b %d %H:%M:%S %Y %Z"
        ).replace(tzinfo=datetime.timezone.utc)
        days_left = (expiry - now).days
        issuer_lower = issuer.lower()
        le_name = "let" + chr(39) + "s encrypt"
        trusted_le = (
            le_name in issuer_lower
            and "fake" not in issuer_lower
            and "staging" not in issuer_lower
        )

        if not trusted_le:
            print(f"[WARN]  {domain} - not trusted LE; issuer={issuer}; expires={expiry_text}")
        elif days_left > 30:
            print(f"[ OK ]  {domain} - trusted LE; {days_left} days remaining ({expiry_text})")
        elif days_left >= 0:
            print(f"[WARN]  {domain} - trusted LE; {days_left} days remaining; renew soon ({expiry_text})")
        else:
            print(f"[FAIL]  {domain} - expired ({expiry_text})")
    except Exception as exc:
        print(f"[WARN]  {domain} - no readable cert at {path}: {exc}")
'; then
    log_error "Certificate status check failed."
    exit 1
  fi
  exit 0
fi

if [[ "$MODE" == "--upgrade" ]]; then
  log_banner "Umbra - Upgrade to Real TLS Certificates"
  validate_domains || exit 1

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
      log_fail "$domain -> $resolved (expected $SERVER_IP)"
      (( ++FAILED ))
    else
      log_ok "$domain -> $resolved"
    fi
  done

  if (( FAILED > 0 )); then
    log_error "$FAILED domain(s) not pointing to this server. Fix DNS first."
    exit 1
  fi

  STAMP="$(date +%Y%m%d-%H%M%S)"
  BACKUP_NAME="letsencrypt.backup.$STAMP"
  STAGED_NAME="letsencrypt.staged"
  FAILED_NAME="letsencrypt.failed.$STAMP"

  log_step "Issuing real Let's Encrypt certificates into staging directory..."
  log_info "Existing production certs remain untouched until all domains issue successfully."
  log_info "Existing trusted LE certs are reused; only missing or non-trusted certs are issued in the staged copy."
  log_info "Partially issued staged certs are preserved for the next retry."
  prepare_staged_certs "$STAGED_NAME"
  umbra_clean_empty_renewal_configs "$DATA_DIR/$STAGED_NAME"

  if ! CERTBOT_STAGING=false CERTBOT_REPLACE_UNTRUSTED=true CERTBOT_CERT_DIR="$DATA_DIR/$STAGED_NAME" bash "$SCRIPT_DIR/../deploy/03-issue-certs.sh"; then
    log_error "Certificate issuance failed; existing production certificates were not touched."
    log_info "Partial staged certs, if any, were kept at: $DATA_DIR/$STAGED_NAME"
    log_info "If Let's Encrypt rate-limited this host, wait until the retry-after time and run again."
    exit 1
  fi

  log_step "Activating newly issued certificates..."
  if ! activate_staged_certs "$STAGED_NAME" "$BACKUP_NAME"; then
    log_error "Activation failed; previous certificates were restored if they existed."
    log_info "Staged certificates, if present, are at: $DATA_DIR/$STAGED_NAME"
    exit 1
  fi
  log_ok "Activated new certificates"
  log_ok "Previous certificates saved at: $DATA_DIR/$BACKUP_NAME"

  log_step "Syncing Marzban TLS certificate..."
  if ! sync_marzban_tls; then
    log_error "Marzban TLS sync failed after activation; restoring previous certificates."
    if restore_backup_certs "$BACKUP_NAME" "$FAILED_NAME"; then
      log_ok "Previous certificates restored. Failed new certs saved at: $DATA_DIR/$FAILED_NAME"
      sync_marzban_tls || log_warn "Could not resync Marzban TLS after rollback"
    else
      log_error "Automatic certificate rollback failed."
    fi
    exit 1
  fi

  log_step "Restarting Nginx and Marzban with new certificates..."
  if docker compose -f "$REPO_DIR/docker-compose.yml" restart umbra-nginx umbra-marzban 2>/dev/null; then
    log_ok "Nginx and Marzban restarted"
  else
    log_error "Restart failed after certificate activation."
    log_step "Restoring previous certificates..."
    if restore_backup_certs "$BACKUP_NAME" "$FAILED_NAME"; then
      log_ok "Previous certificates restored. Failed new certs saved at: $DATA_DIR/$FAILED_NAME"
      sync_marzban_tls || log_warn "Could not resync Marzban TLS after rollback"
      docker compose -f "$REPO_DIR/docker-compose.yml" restart umbra-nginx umbra-marzban >/dev/null 2>&1 || true
    else
      log_error "Automatic certificate rollback failed."
      log_info "Previous certificates may still be available at: $DATA_DIR/$BACKUP_NAME"
    fi
    log_info "Check: docker compose ps && docker compose logs umbra-nginx umbra-marzban --tail=120"
    exit 1
  fi

  echo ""
  log_ok "TLS upgrade complete. All domains now use trusted certificates."
  exit 0
fi

if [[ -n "$MODE" ]] && [[ "$MODE" != "--renew" ]]; then
  log_error "Unknown certs mode: $MODE"
  log_info "Usage: bash scripts/ops.sh certs [--renew|--status|--upgrade|--clean-renewal-state]"
  exit 1
fi

log_banner "Umbra - Certificate Renewal"
validate_domains || exit 1

RENEW_MARKER_DIR="$DATA_DIR/certbot/hooks"
RENEW_MARKER="$RENEW_MARKER_DIR/renewed"
mkdir -p "$CERT_DIR" "$WEBROOT" "$DATA_DIR/certbot/config" "$RENEW_MARKER_DIR"
rm -f "$RENEW_MARKER"

log_step "Cleaning invalid renewal state..."
umbra_clean_empty_renewal_configs "$CERT_DIR"

log_step "Running certbot renew..."
docker run --rm \
  -v "$CERT_DIR:/etc/letsencrypt" \
  -v "$DATA_DIR/certbot/config:/var/lib/letsencrypt" \
  -v "$WEBROOT:/var/www/certbot" \
  -v "$RENEW_MARKER_DIR:/hooks" \
  certbot/certbot renew \
    --webroot \
    --webroot-path /var/www/certbot \
    --non-interactive \
    --quiet \
    --deploy-hook "sh -c 'date -u +%Y-%m-%dT%H:%M:%SZ > /hooks/renewed'"

if [[ ! -f "$RENEW_MARKER" ]]; then
  log_ok "No certificates renewed; services left untouched."
  exit 0
fi

log_step "Syncing Marzban TLS certificate..."
sync_marzban_tls

log_step "Testing and reloading Nginx..."
if docker exec "$NGINX_CONTAINER" nginx -t >/dev/null 2>&1 \
   && docker exec "$NGINX_CONTAINER" nginx -s reload >/dev/null 2>&1; then
  log_ok "Nginx reloaded"
else
  log_warn "Nginx reload failed; container may not be running or config may be invalid"
fi

log_step "Restarting Marzban (picks up renewed cert on startup)..."
if docker compose -f "$REPO_DIR/docker-compose.yml" restart umbra-marzban 2>/dev/null; then
  log_ok "Marzban restarted"
else
  log_warn "Marzban restart failed; container may not be running"
fi

log_ok "Certificate renewal check complete."
