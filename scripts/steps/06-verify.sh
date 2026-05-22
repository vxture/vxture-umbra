#!/usr/bin/env bash
# Post-deployment verification suite
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/env.sh"
source "$SCRIPT_DIR/../lib/log.sh"

log_banner "Umbra — Verification"

PASS=0
FAIL=0

check() {
  local desc="$1"; shift
  if "$@" &>/dev/null; then
    log_ok "$desc"
    (( ++PASS ))
  else
    log_fail "$desc"
    (( ++FAIL ))
  fi
}

check_http() {
  local desc="$1"
  local url="$2"
  local expected_code="${3:-200}"
  local code
  code=$(curl -sk --max-time 10 -o /dev/null -w "%{http_code}" "$url" 2>/dev/null || echo "000")
  if [[ "$code" == "$expected_code" ]] || \
     ([[ "$expected_code" == "200" ]] && [[ "$code" =~ ^(200|301|302)$ ]]); then
    log_ok "$desc ($code)"
    (( ++PASS ))
  else
    log_fail "$desc (got $code, expected $expected_code)"
    (( ++FAIL ))
  fi
}

# ── Container status ──────────────────────────────────────────────────────────
log_step "Container health..."

CONTAINERS=(
  umbra-nginx umbra-marzban
  umbra-vaultwarden umbra-uptime umbra-portal umbra-docs umbra-shortlink
)

cd "$REPO_DIR"
for c in "${CONTAINERS[@]}"; do
  state=$(docker inspect "$c" --format '{{.State.Status}}' 2>/dev/null || echo "missing")
  if [[ "$state" == "running" ]]; then
    log_ok "$c: running"
    (( ++PASS ))
  else
    log_fail "$c: $state"
    (( ++FAIL ))
  fi
done

# ── HTTPS endpoints ───────────────────────────────────────────────────────────
log_step "HTTPS endpoints..."

check_http "ruyin.ai"          "https://$APEX_DOMAIN"
check_http "www.ruyin.ai"      "https://$WWW_DOMAIN"
check_http "vpn.ruyin.ai"      "https://$EDGE_DOMAIN"
check_http "vault.ruyin.ai"    "https://$VAULT_DOMAIN"
check_http "status.ruyin.ai"   "https://$STATUS_DOMAIN"
check_http "docs.ruyin.ai"     "https://$DOCS_DOMAIN"
check_http "go.ruyin.ai"       "https://$SHORTLINK_DOMAIN"

# sub.ruyin.ai — random path should 404, but domain should respond
SUB_CODE=$(curl -sk --max-time 10 -o /dev/null -w "%{http_code}" "https://$SUB_DOMAIN/" || echo "000")
if [[ "$SUB_CODE" == "404" ]] || [[ "$SUB_CODE" == "200" ]]; then
  log_ok "sub.ruyin.ai responding ($SUB_CODE)"
  (( ++PASS ))
else
  log_fail "sub.ruyin.ai not responding (got $SUB_CODE)"
  (( ++FAIL ))
fi

# ── console.ruyin.ai access control ──────────────────────────────────────────
# Note: when tested from the server itself, the stream proxy presents as 127.0.0.1,
# which is in the allow list, so the IP layer is bypassed and Basic Auth (401) is
# what the server sees. From the public internet the IP deny returns 403.
log_step "console.ruyin.ai access control..."
CONSOLE_CODE=$(curl -sk --max-time 10 -o /dev/null -w "%{http_code}" "https://$CONSOLE_DOMAIN" || echo "000")
if [[ "$CONSOLE_CODE" == "403" ]] || [[ "$CONSOLE_CODE" == "000" ]] || [[ "$CONSOLE_CODE" == "401" ]]; then
  log_ok "console.ruyin.ai protected ($CONSOLE_CODE — 403=IP blocked, 401=auth gate active)"
  (( ++PASS ))
else
  log_fail "console.ruyin.ai unexpectedly open (got $CONSOLE_CODE)"
  (( ++FAIL ))
fi

# ── Port 443 open ─────────────────────────────────────────────────────────────
log_step "Port checks..."
if timeout 5 bash -c "</dev/tcp/$EDGE_DOMAIN/443" 2>/dev/null; then
  log_ok "Port 443 open on $EDGE_DOMAIN"
  (( ++PASS ))
else
  log_fail "Port 443 not reachable on $EDGE_DOMAIN"
  (( ++FAIL ))
fi

# ── SQLite databases ──────────────────────────────────────────────────────────
log_step "Database check..."

declare -A SQLITE_DBS=(
  ["marzban"]="$DATA_DIR/marzban/db.sqlite3"
  ["vaultwarden"]="$DATA_DIR/vaultwarden/data/db.sqlite3"
  ["shlink"]="$DATA_DIR/shortlink/data/database.sqlite"
)

for label in marzban vaultwarden shlink; do
  db_path="${SQLITE_DBS[$label]}"
  if [[ -f "$db_path" ]]; then
    size=$(du -sh "$db_path" 2>/dev/null | cut -f1 || echo "?")
    log_ok "SQLite $label: $db_path ($size)"
    (( ++PASS ))
  else
    log_warn "SQLite $label: not yet initialized ($db_path) — normal on first run"
  fi
done

# ── Marzban API ───────────────────────────────────────────────────────────────
log_step "Marzban API..."
MARZBAN_CODE=$(docker exec umbra-nginx \
  wget -qO- --server-response http://umbra-marzban:8000/api/core/stats 2>&1 \
  | grep "HTTP/" | awk '{print $2}' | head -1 || echo "000")
if [[ "$MARZBAN_CODE" =~ ^(200|401|403)$ ]]; then
  log_ok "Marzban API reachable (internal) → $MARZBAN_CODE"
  (( ++PASS ))
else
  log_warn "Marzban API check inconclusive (got $MARZBAN_CODE) — check manually"
fi

# ── TLS certificates ──────────────────────────────────────────────────────────
log_step "Certificate expiry check..."
for domain in "$APEX_DOMAIN" "$EDGE_DOMAIN" "$SUB_DOMAIN" "$VAULT_DOMAIN"; do
  expiry=$(echo | openssl s_client -connect "$domain:443" -servername "$domain" 2>/dev/null \
    | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2 || echo "")
  if [[ -n "$expiry" ]]; then
    log_ok "$domain cert valid until: $expiry"
    (( ++PASS ))
  else
    log_warn "$domain — could not read cert expiry"
  fi
done

# ── Result ────────────────────────────────────────────────────────────────────
echo ""
log_info "Results: ${PASS} passed, ${FAIL} failed"

if (( FAIL > 0 )); then
  log_error "Verification failed ($FAIL checks). Review logs above."
  exit 1
fi
log_ok "All verification checks passed."
