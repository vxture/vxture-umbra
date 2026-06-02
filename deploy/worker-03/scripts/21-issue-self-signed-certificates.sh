#!/usr/bin/env bash
# Generate self-signed certificates for all domains.
# Use this when DNS is not yet pointed to this server and real certs
# cannot be issued. Allows the rest of the deployment to proceed.
# Replace with real certs: bash deploy/worker-03/ops.sh certs --upgrade
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/01-env.sh"
source "$SCRIPT_DIR/../lib/00-log.sh"
source "$SCRIPT_DIR/../lib/02-certs.sh"

if [[ "${1:-}" == "--help" ]] || [[ "${1:-}" == "-h" ]]; then
  echo ""
  echo "  Usage: bash deploy/worker-03/deploy.sh certificates  (preferred)"
  echo "         bash deploy/worker-03/scripts/21-issue-self-signed-certificates.sh"
  echo ""
  echo "  Generates self-signed certificates for all domains."
  echo "  Use when DNS is not yet pointed to this server."
  echo "  Set MARZBAN_SSL_CA_TYPE=private in .env."
  echo ""
  echo "  Replace with real certs later:"
  echo "    bash deploy/worker-03/ops.sh certs --upgrade"
  echo ""
  exit 0
fi

log_banner "Umbra - Self-Signed Certificates (debug mode)"
log_warn "These certs are NOT trusted by browsers."
log_warn "Run ops.sh certs --upgrade once DNS is pointed to this server."
log_warn "Set MARZBAN_SSL_CA_TYPE=private in .env while using self-signed certs."
echo ""

CERT_DIR="$DATA_DIR/letsencrypt"

mapfile -t DOMAINS < <(umbra_collect_cert_domains)

FAILED=0

for domain in "${DOMAINS[@]}"; do
  if ! umbra_validate_cert_domain "$domain"; then
    (( ++FAILED ))
    continue
  fi

  cert_path="$CERT_DIR/live/$domain/fullchain.pem"

  if [[ -f "$cert_path" ]]; then
    log_info "$domain - cert already exists, skipping"
    continue
  fi

  mkdir -p "$CERT_DIR/live/$domain"

  openssl req -x509 -newkey rsa:2048 \
    -keyout "$CERT_DIR/live/$domain/privkey.pem" \
    -out    "$CERT_DIR/live/$domain/fullchain.pem" \
    -days 90 -nodes \
    -subj "/CN=$domain" 2>/dev/null

  chmod 600 "$CERT_DIR/live/$domain/privkey.pem"
  log_ok "Self-signed cert created: $domain"
done

echo ""
if (( FAILED > 0 )); then
  log_error "$FAILED domain(s) were invalid. Self-signed certificate generation failed."
  exit 1
fi

log_ok "All self-signed certificates ready."
log_info "To upgrade to real certs once DNS is ready:"
log_info "  bash deploy/worker-03/ops.sh certs --upgrade"
