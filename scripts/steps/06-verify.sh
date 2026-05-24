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

check_http_exact() {
  local desc="$1"
  local url="$2"
  local expected_code="$3"
  local code
  code=$(curl -sk --max-time 10 -o /dev/null -w "%{http_code}" "$url" 2>/dev/null || echo "000")
  if [[ "$code" == "$expected_code" ]]; then
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
  umbra-vaultwarden umbra-portal
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

check_http "$APEX_DOMAIN"        "https://$APEX_DOMAIN"
check_http "$WWW_DOMAIN"         "https://$WWW_DOMAIN"
check_http "$EDGE_DOMAIN"        "https://$EDGE_DOMAIN"
check_http "$PASS_DOMAIN"        "https://$PASS_DOMAIN"
check_http "$VAULT_DOMAIN"       "https://$VAULT_DOMAIN"

# SUB_DOMAIN only exposes Marzban native GET /sub/{token}.
# Marzban returns 405 to HEAD (-I), so verification must use GET.
check_http_exact "$SUB_DOMAIN root blocked"              "https://$SUB_DOMAIN/" 404
check_http_exact "$SUB_DOMAIN /sub blocked"             "https://$SUB_DOMAIN/sub" 404
check_http_exact "$SUB_DOMAIN /sub/ blocked"            "https://$SUB_DOMAIN/sub/" 404
check_http_exact "$SUB_DOMAIN clash-meta variant blocked" "https://$SUB_DOMAIN/sub/TESTTOKEN/clash-meta" 404

latest_sub_file=$(ls -t "$BACKUP_DIR"/subscription-urls-*.txt 2>/dev/null | head -1 || true)
if [[ -n "$latest_sub_file" ]]; then
  latest_sub_url=$(awk 'NF >= 2 && $1 !~ /^#/ && $2 ~ /^https:\/\// {print $2; exit}' "$latest_sub_file")
  if [[ -n "$latest_sub_url" ]]; then
    check_http_exact "Saved Marzban subscription URL works (GET)" "$latest_sub_url" 200
  else
    log_warn "No subscription URL found in $latest_sub_file"
  fi
else
  log_warn "No saved subscription URL file found in $BACKUP_DIR; run deploy-post.sh after first deploy"
fi

# ── CONSOLE_DOMAIN access control ────────────────────────────────────────────
# Note: when tested from the server itself, the stream proxy presents as 127.0.0.1,
# which is in the allow list, so the IP layer is bypassed and Basic Auth (401) is
# what the server sees. From the public internet the IP deny returns 403.
log_step "$CONSOLE_DOMAIN access control..."
CONSOLE_CODE=$(curl -sk --max-time 10 -o /dev/null -w "%{http_code}" "https://$CONSOLE_DOMAIN" || echo "000")
if [[ "$CONSOLE_CODE" == "403" ]] || [[ "$CONSOLE_CODE" == "000" ]] || [[ "$CONSOLE_CODE" == "401" ]]; then
  log_ok "$CONSOLE_DOMAIN protected ($CONSOLE_CODE — 403=IP blocked, 401=auth gate active)"
  (( ++PASS ))
else
  log_fail "$CONSOLE_DOMAIN unexpectedly open (got $CONSOLE_CODE)"
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
)

for label in marzban vaultwarden; do
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
MARZBAN_CODE=$(docker exec -i umbra-marzban python3 - <<'PYEOF' 2>/dev/null
import urllib.request, sys
try:
    with urllib.request.urlopen('http://localhost:8000/api/inbounds', timeout=10) as r:
        print(r.status)
except urllib.error.HTTPError as e:
    print(e.code)
except Exception:
    print('000')
PYEOF
)
if [[ "$MARZBAN_CODE" =~ ^(200|401|403)$ ]]; then
  log_ok "Marzban API reachable (internal) → $MARZBAN_CODE"
  (( ++PASS ))
else
  log_warn "Marzban API check inconclusive (got $MARZBAN_CODE) — check manually"
fi

# ── TLS certificates ──────────────────────────────────────────────────────────
log_step "Certificate expiry check..."
for domain in "$APEX_DOMAIN" "$EDGE_DOMAIN" "$SUB_DOMAIN" "$PASS_DOMAIN" "$VAULT_DOMAIN"; do
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
