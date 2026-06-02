#!/usr/bin/env bash
# Certificate lifecycle management.
#
# Usage:
#   bash deploy/worker-03/ops.sh certs --renew      # run renewal check (cron default)
#   bash deploy/worker-03/ops.sh certs --upgrade    # replace self-signed with real LE certs
#   bash deploy/worker-03/ops.sh certs --status     # show cert expiry for all domains
#   bash deploy/worker-03/ops.sh certs --clean-renewal-state
#   bash deploy/worker-03/ops.sh certs --clean-workdirs
#   bash deploy/worker-03/ops.sh certs --clean-retired-lineages
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/01-env.sh"
source "$SCRIPT_DIR/../lib/00-log.sh"
source "$SCRIPT_DIR/../lib/02-certs.sh"

MODE="${1:-}"

CERT_DIR="$DATA_DIR/letsencrypt"
WEBROOT="$DATA_DIR/certbot/www"

mapfile -t DOMAINS < <(umbra_collect_cert_domains)

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

report_cert_workdirs() {
  local workdirs
  workdirs="$(umbra_list_cert_workdirs "$DATA_DIR")"
  if [[ -z "$workdirs" ]]; then
    return 0
  fi

  log_warn "Certificate work directories found:"
  while IFS= read -r dir; do
    [[ -n "$dir" ]] && log_warn "  $dir"
  done <<< "$workdirs"
  log_info "Only letsencrypt.staged is reused by upgrade; backups are retained for rollback."
}

clean_retired_cert_lineages() {
  local active_domains
  active_domains="${DOMAINS[*]}"

  docker run --rm \
    -v "$CERT_DIR:/certs" \
    -e ACTIVE_CERT_DOMAINS="$active_domains" \
    alpine sh -c '
      set -eu

      is_active() {
        target="$1"
        for domain in $ACTIVE_CERT_DOMAINS; do
          [ "$target" = "$domain" ] && return 0
        done
        return 1
      }

      removed=0

      for section in live archive; do
        [ -d "/certs/$section" ] || continue
        for path in /certs/$section/*; do
          [ -d "$path" ] || continue
          domain="${path##*/}"
          if is_active "$domain"; then
            echo "keep:$section/$domain"
          else
            rm -rf "$path"
            echo "removed:$section/$domain"
            removed=1
          fi
        done
      done

      if [ -d /certs/renewal ]; then
        for path in /certs/renewal/*.conf; do
          [ -f "$path" ] || continue
          file="${path##*/}"
          domain="${file%.conf}"
          if is_active "$domain"; then
            echo "keep:renewal/$file"
          else
            rm -f "$path"
            echo "removed:renewal/$file"
            removed=1
          fi
        done
      fi

      echo "__removed=$removed"
    '
}

prepare_staged_certs() {
  local staged_name="$1"

  # CERT-005: The staged directory is retry state. It may contain LE certs that
  # were issued before a later domain hit rate limits, so never recreate it if
  # it already exists.
  docker run --rm \
    -v "$DATA_DIR:/data" \
    -e STAGED_NAME="$staged_name" \
    alpine sh -c '
      set -eu
      staged="/data/$STAGED_NAME"

      # Reuse staged work to avoid re-requesting certs already issued before a
      # later domain hit a rate limit.
      if [ -d "$staged" ]; then
        echo "Reusing existing staged certificate directory: $staged"
      elif [ -d /data/letsencrypt ]; then
        cp -a /data/letsencrypt "$staged"
      else
        mkdir -p "$staged"
      fi

      for dir in "$staged/live" "$staged/archive" "$staged/renewal"; do
        if [ -d "$dir" ]; then
          find "$dir" -type d -exec chmod a+rx {} \;
        fi
      done
    '
}

verify_cert_dir_trusted() {
  local cert_dir="$1"

  # CERT-008: Activation has a second gate independent of Certbot's exit code.
  # Every configured domain must have a readable, unexpired, production LE cert.
  docker run --rm \
    --entrypoint python \
    -v "$cert_dir:/certs:ro" \
    -e DOMAINS="${DOMAINS[*]}" \
    certbot/certbot \
    -c '
import datetime
import os
import ssl
import sys

domains = os.environ["DOMAINS"].split()
now = datetime.datetime.now(datetime.timezone.utc)
le_name = "let" + chr(39) + "s encrypt"
failed = 0

def flatten_name(name):
    return ", ".join("=".join(part) for rdn in name for part in rdn)

for domain in domains:
    path = f"/certs/live/{domain}/fullchain.pem"
    try:
        cert = ssl._ssl._test_decode_cert(path)
        issuer = flatten_name(cert.get("issuer", ())).lower()
        expiry_text = cert["notAfter"]
        expiry = datetime.datetime.strptime(
            expiry_text, "%b %d %H:%M:%S %Y %Z"
        ).replace(tzinfo=datetime.timezone.utc)
        trusted_le = le_name in issuer and "fake" not in issuer and "staging" not in issuer
        sans = [value.lower() for key, value in cert.get("subjectAltName", ()) if key == "DNS"]
        name_matches = domain.lower() in sans
        if not trusted_le or expiry <= now or not name_matches:
            print(f"[FAIL]  {domain}: cert is not trusted LE, is expired, or does not match domain")
            failed += 1
    except Exception as exc:
        print(f"[FAIL]  {domain}: no readable trusted cert: {exc}")
        failed += 1

sys.exit(1 if failed else 0)
'
}

activate_staged_certs() {
  local staged_name="$1"
  local backup_name="$2"

  # CERT-009: Activation is a rename transaction. If moving staged into current
  # fails, restore the previous current directory before returning failure.
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

  # CERT-010: Post-activation service failures roll back certificate state and
  # keep the failed new directory for forensics.
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

if [[ "$MODE" == "--clean-workdirs" ]]; then
  log_banner "Umbra - Clean Certificate Workdirs"
  validate_domains || exit 1
  log_info "Migrates the newest legacy letsencrypt.new.* to letsencrypt.staged if needed."
  log_info "Removes obsolete letsencrypt.new.* and letsencrypt.failed.* only."
  log_info "Production certs and letsencrypt.backup.* directories are preserved."
  umbra_migrate_legacy_staged_certs "$DATA_DIR"
  umbra_clean_obsolete_cert_workdirs "$DATA_DIR"
  report_cert_workdirs
  log_ok "Certificate workdir cleanup complete."
  exit 0
fi

if [[ "$MODE" == "--clean-retired-lineages" ]]; then
  log_banner "Umbra - Clean Retired Certificate Lineages"
  validate_domains || exit 1
  log_info "Active certificate domains:"
  for domain in "${DOMAINS[@]}"; do
    log_info "  $domain"
  done
  log_info "Only non-active entries under live/, archive/, and renewal/*.conf are removed."
  log_info "Certificate backups and workdirs are preserved."
  cleanup_output="$(clean_retired_cert_lineages)"
  removed=0
  while IFS= read -r line; do
    case "$line" in
      keep:*)
        log_info "${line#keep:} kept"
        ;;
      removed:*)
        log_warn "${line#removed:} removed"
        ;;
      __removed=1)
        removed=1
        ;;
    esac
  done <<< "$cleanup_output"
  if [[ "$removed" == "1" ]]; then
    log_ok "Retired certificate lineage cleanup complete."
  else
    log_ok "No retired certificate lineages found."
  fi
  exit 0
fi

if [[ "$MODE" == "--status" ]]; then
  log_banner "Umbra - Certificate Status"
  validate_domains || exit 1
  log_info "Reading certs inside Docker so root-owned certbot files are visible."
  report_empty_renewal_configs
  report_cert_workdirs

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
  # CERT-007: Old timestamped workdirs are normalized before issuance so future
  # retries have exactly one reusable staged directory.
  umbra_migrate_legacy_staged_certs "$DATA_DIR"
  umbra_clean_obsolete_cert_workdirs "$DATA_DIR"
  prepare_staged_certs "$STAGED_NAME"
  umbra_clean_empty_renewal_configs "$DATA_DIR/$STAGED_NAME"

  if ! CERTBOT_STAGING=false CERTBOT_REPLACE_UNTRUSTED=true CERTBOT_CERT_DIR="$DATA_DIR/$STAGED_NAME" bash "$SCRIPT_DIR/20-issue-tls-certificates.sh"; then
    log_error "Certificate issuance failed; existing production certificates were not touched."
    log_info "Partial staged certs, if any, were kept at: $DATA_DIR/$STAGED_NAME"
    log_info "If Let's Encrypt rate-limited this host, wait until the retry-after time and run again."
    exit 1
  fi

  log_step "Verifying staged certificates..."
  if ! verify_cert_dir_trusted "$DATA_DIR/$STAGED_NAME"; then
    log_error "Staged certificate verification failed; production certificates were not touched."
    log_info "Partial staged certs remain at: $DATA_DIR/$STAGED_NAME"
    exit 1
  fi
  log_ok "All staged certificates are trusted LE certs"

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
  log_info "Usage: bash deploy/worker-03/ops.sh certs [--renew|--status|--upgrade|--clean-renewal-state|--clean-workdirs|--clean-retired-lineages]"
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

log_step "Running certbot renew for active domains..."
RENEW_FAILED=0
for domain in "${DOMAINS[@]}"; do
  log_info "Checking renewal for: $domain"
  if ! docker run --rm \
    -v "$CERT_DIR:/etc/letsencrypt" \
    -v "$DATA_DIR/certbot/config:/var/lib/letsencrypt" \
    -v "$WEBROOT:/var/www/certbot" \
    -v "$RENEW_MARKER_DIR:/hooks" \
    certbot/certbot renew \
      --cert-name "$domain" \
      --webroot \
      --webroot-path /var/www/certbot \
      --non-interactive \
      --quiet \
      --deploy-hook "sh -c 'date -u +%Y-%m-%dT%H:%M:%SZ > /hooks/renewed'"; then
    log_warn "Certbot renewal check failed for: $domain"
    (( ++RENEW_FAILED ))
  fi
done

if [[ ! -f "$RENEW_MARKER" ]]; then
  if (( RENEW_FAILED > 0 )); then
    log_error "$RENEW_FAILED certificate renewal check(s) failed."
    exit 1
  fi
  log_ok "No certificates renewed; services left untouched."
  exit 0
fi

log_step "Syncing Marzban TLS certificate..."
sync_marzban_tls

log_step "Testing and reloading Nginx..."
if nginx_test_output="$(docker exec "$NGINX_CONTAINER" nginx -t 2>&1)"; then
  printf '%s\n' "$nginx_test_output"
  if docker exec "$NGINX_CONTAINER" nginx -s reload >/dev/null 2>&1; then
    log_ok "Nginx reloaded"
  else
    log_warn "Nginx config is valid, but reload command failed"
  fi
else
  printf '%s\n' "$nginx_test_output" >&2
  log_warn "Nginx config test failed after renewal; nginx was not reloaded"
fi

log_step "Restarting Marzban (picks up renewed cert on startup)..."
if docker compose -f "$REPO_DIR/docker-compose.yml" restart umbra-marzban 2>/dev/null; then
  log_ok "Marzban restarted"
else
  log_warn "Marzban restart failed; container may not be running"
fi

if (( RENEW_FAILED > 0 )); then
  log_error "$RENEW_FAILED certificate renewal check(s) failed."
  exit 1
fi

log_ok "Certificate renewal check complete."
