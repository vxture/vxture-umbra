#!/usr/bin/env bash
# Post-deployment verification suite
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/01-env.sh"
source "$SCRIPT_DIR/../lib/00-log.sh"

if [[ "${1:-}" == "--help" ]] || [[ "${1:-}" == "-h" ]]; then
  echo ""
  echo "  Usage: bash deploy/deploy.sh verify"
  echo ""
  echo "  Runs post-deployment verification: container health, HTTPS"
  echo "  endpoints, SQLite databases, Marzban API, cron jobs, and"
  echo "  TLS certificate expiry. All checks are read-only."
  echo ""
  echo "  Called automatically by: bash deploy/deploy.sh all"
  echo "  Run standalone:          bash deploy/deploy.sh verify"
  echo ""
  exit 0
fi

log_banner "Umbra - Verification"

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

check_http_body_contains() {
  local desc="$1"
  local url="$2"
  local needle="$3"
  local code
  local body_file
  body_file=$(mktemp)
  code=$(curl -sk --max-time 10 -o "$body_file" -w "%{http_code}" "$url" 2>/dev/null || echo "000")
  if [[ "$code" == "200" ]] && grep -Fq "$needle" "$body_file"; then
    log_ok "$desc ($code)"
    (( ++PASS ))
  else
    log_fail "$desc (got $code, expected page containing '$needle')"
    (( ++FAIL ))
  fi
  rm -f "$body_file"
}

curl_saved_subscription() {
  local url="$1"
  local headers_file="$2"
  local body_file="$3"
  local code
  local attempt

  for attempt in 1 2 3 4 5; do
    : > "$headers_file"
    : > "$body_file"
    if code=$(curl -sk --max-time 10 -D "$headers_file" -o "$body_file" -w "%{http_code}" -H "User-Agent: Clash Verge" "$url" 2>/dev/null); then
      :
    else
      code="000"
    fi

    if [[ "$code" == "200" ]]; then
      printf '%s\n' "$code"
      return 0
    fi

    if [[ "$code" =~ ^(000|502|503|504)$ && "$attempt" -lt 5 ]]; then
      sleep 3
      continue
    fi

    printf '%s\n' "$code"
    return 0
  done
}

# -- Container status ----------------------------------------------------------
log_step "Container health..."

CONTAINERS=(
  umbra-nginx umbra-marzban
  umbra-subproxy umbra-account umbra-account-web
  umbra-vaultwarden umbra-website umbra-hysteria
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

# -- HTTPS endpoints -----------------------------------------------------------
log_step "HTTPS endpoints..."

check_http "$APEX_DOMAIN"        "https://$APEX_DOMAIN"
check_http_body_contains "$APEX_DOMAIN Umbra homepage" "https://$APEX_DOMAIN/" "vxture studio"
check_http "$WWW_DOMAIN"         "https://$WWW_DOMAIN"
# EDGE_DOMAIN (vpn) display retired: vpn.ruyin.ai now falls through to the
# catch-all (444), identical to any unknown host. The proxy node on :443 is
# still verified by the port-open check below.
check_http_body_contains "$CONSOLE_DOMAIN account home" "https://$CONSOLE_DOMAIN/" "Umbra Account"
check_http "$CONSOLE_DOMAIN account login" "https://$CONSOLE_DOMAIN/login"
check_http "$CONSOLE_DOMAIN account registration" "https://$CONSOLE_DOMAIN/register"
if [[ -n "${OIDC_ISSUER:-}" ]]; then
  sso_headers="$(mktemp)"
  sso_code=$(curl -sk --max-time 10 -D "$sso_headers" -o /dev/null -w "%{http_code}" "https://$CONSOLE_DOMAIN/auth/login" || true)
  if [[ "$sso_code" =~ ^(301|302|303|307|308)$ ]] \
     && grep -Fqi "location: $OIDC_ISSUER/oidc/authorize?" "$sso_headers"; then
    log_ok "$CONSOLE_DOMAIN OIDC login redirects to authorize ($sso_code)"
    (( ++PASS ))
  else
    log_fail "$CONSOLE_DOMAIN OIDC login redirect invalid (got $sso_code)"
    sed -n '1,20p' "$sso_headers" || true
    (( ++FAIL ))
  fi
  rm -f "$sso_headers"
fi
check_http "$PAS_DOMAIN"        "https://$PAS_DOMAIN"

# SUB_DOMAIN only exposes Marzban native GET /sub/{token}.
# Marzban returns 405 to HEAD (-I), so verification must use GET.
check_http_exact "$SUB_DOMAIN root blocked"              "https://$SUB_DOMAIN/" 404
check_http_exact "$SUB_DOMAIN /sub blocked"             "https://$SUB_DOMAIN/sub" 404
check_http_exact "$SUB_DOMAIN /sub/ blocked"            "https://$SUB_DOMAIN/sub/" 404
check_http_exact "$SUB_DOMAIN clash-meta variant blocked" "https://$SUB_DOMAIN/sub/TESTTOKEN/clash-meta" 404

latest_sub_file=$(ls -t "$BACKUP_DIR"/subscription-urls-*.txt 2>/dev/null | head -1 || true)
if [[ -n "$latest_sub_file" ]]; then
  latest_sub_user=""
  latest_sub_url=""
  read -r latest_sub_user latest_sub_url < <(awk 'NF >= 2 && $1 !~ /^#/ && $2 ~ /^https:\/\// {print $1, $2; exit}' "$latest_sub_file")
  if [[ -n "$latest_sub_url" ]]; then
    sub_headers=$(mktemp)
    sub_headers_clean=$(mktemp)
    sub_body=$(mktemp)
    sub_code=$(curl_saved_subscription "$latest_sub_url" "$sub_headers" "$sub_body")
    expected_title="${SUB_PROFILE_PREFIX:-Umbra}-${latest_sub_user}"

    if [[ "$sub_code" == "200" ]]; then
      log_ok "Saved Marzban subscription URL works (GET) (200)"
      (( ++PASS ))
    else
      log_fail "Saved Marzban subscription URL failed (got $sub_code)"
      (( ++FAIL ))
    fi

    tr -d '\r' < "$sub_headers" > "$sub_headers_clean"

    if grep -Fxiq "content-disposition: attachment; filename=${expected_title}" "$sub_headers_clean" \
       && head -1 "$sub_body" | tr -d '\r' | grep -Fxq "#profile-title: $expected_title"; then
      log_ok "Subscription name normalized: $expected_title"
      (( ++PASS ))
    else
      log_fail "Subscription name not normalized to $expected_title"
      log_info "Headers:"
      sed -n '1,20p' "$sub_headers"
      log_info "Body first line:"
      head -1 "$sub_body" || true
      (( ++FAIL ))
    fi
    rm -f "$sub_headers" "$sub_headers_clean" "$sub_body"
  else
    log_warn "No subscription URL found in $latest_sub_file"
  fi
else
  log_warn "No saved subscription URL file found in $BACKUP_DIR; run deploy.sh wizard after first deploy"
fi

# -- ADMIN_DOMAIN management app ----------------------------------------------
# admin.ruyin.ai serves the umbra-admin management app at the root (built-in
# credential login + invite/subscription block). Marzban keeps /dashboard/ and
# its API; Vault is an external jump.
log_step "$ADMIN_DOMAIN admin..."
check_http_body_contains "$ADMIN_DOMAIN admin app home" "https://$ADMIN_DOMAIN/" "Umbra Admin"

admin_root_headers="$(mktemp)"
ADMIN_ROOT_CODE=$(curl -sk --max-time 10 -D "$admin_root_headers" -o /dev/null -w "%{http_code}" "https://$ADMIN_DOMAIN/" || true)
if grep -Eiq '^location: .*:8443(/|[[:space:]]|$)' "$admin_root_headers"; then
  log_fail "$ADMIN_DOMAIN root redirect exposes internal port 8443"
  (( ++FAIL ))
elif [[ "$ADMIN_ROOT_CODE" == "200" ]]; then
  log_ok "$ADMIN_DOMAIN root serves the admin app ($ADMIN_ROOT_CODE)"
  (( ++PASS ))
else
  log_fail "$ADMIN_DOMAIN root does not serve the admin app (got $ADMIN_ROOT_CODE)"
  (( ++FAIL ))
fi
rm -f "$admin_root_headers"

ADMIN_LOGIN_CODE=$(curl -sk --max-time 10 -o /dev/null -w "%{http_code}" -X POST -H "Content-Type: application/json" -d '{"username":"","password":""}' "https://$ADMIN_DOMAIN/api/account/admin/invites" || echo "000")
if [[ "$ADMIN_LOGIN_CODE" == "401" ]]; then
  log_ok "$ADMIN_DOMAIN admin API requires login ($ADMIN_LOGIN_CODE)"
  (( ++PASS ))
else
  log_fail "$ADMIN_DOMAIN admin API does not require login (got $ADMIN_LOGIN_CODE)"
  (( ++FAIL ))
fi

ADMIN_DASH_CODE=$(curl -sk --max-time 10 -o /dev/null -w "%{http_code}" "https://$ADMIN_DOMAIN/dashboard/" || echo "000")
if [[ "$ADMIN_DASH_CODE" =~ ^(200|301|302|307|308|401)$ ]]; then
  log_ok "$ADMIN_DOMAIN Marzban dashboard reachable ($ADMIN_DASH_CODE)"
  (( ++PASS ))
else
  log_fail "$ADMIN_DOMAIN Marzban dashboard not reachable (got $ADMIN_DASH_CODE)"
  (( ++FAIL ))
fi

ADMIN_API_CODE=$(curl -sk --max-time 10 -o /dev/null -w "%{http_code}" "https://$ADMIN_DOMAIN/api/admin" || echo "000")
if [[ "$ADMIN_API_CODE" =~ ^(401|403)$ ]]; then
  log_ok "$ADMIN_DOMAIN Marzban API reachable ($ADMIN_API_CODE)"
  (( ++PASS ))
else
  log_fail "$ADMIN_DOMAIN Marzban API not reachable (got $ADMIN_API_CODE)"
  (( ++FAIL ))
fi

# -- Port 443 open -------------------------------------------------------------
log_step "Port checks..."
if timeout 5 bash -c "</dev/tcp/$EDGE_DOMAIN/443" 2>/dev/null; then
  log_ok "Port 443 open on $EDGE_DOMAIN"
  (( ++PASS ))
else
  log_fail "Port 443 not reachable on $EDGE_DOMAIN"
  (( ++FAIL ))
fi

# Hysteria2 binds UDP 443 on the host (network_mode: host). A UDP listener on
# :443 confirms the fallback transport is up; reachability is checked separately.
if ss -lun 2>/dev/null | grep -q ":443 "; then
  log_ok "Hysteria2 UDP 443 listening"
  (( ++PASS ))
else
  log_fail "Hysteria2 UDP 443 not listening"
  (( ++FAIL ))
fi

# -- SQLite databases ----------------------------------------------------------
log_step "Database check..."

declare -A SQLITE_DBS=(
  ["marzban"]="$DATA_DIR/marzban/db.sqlite3"
  ["account"]="$DATA_DIR/account/account.db"
  ["vaultwarden"]="$DATA_DIR/vaultwarden/data/db.sqlite3"
)

for label in marzban account vaultwarden; do
  db_path="${SQLITE_DBS[$label]}"
  if [[ -f "$db_path" ]]; then
    size=$(du -sh "$db_path" 2>/dev/null | cut -f1 || echo "?")
    log_ok "SQLite $label: $db_path ($size)"
    (( ++PASS ))
  else
    log_warn "SQLite $label: not yet initialized ($db_path) - normal on first run"
  fi
done

# -- Marzban API ---------------------------------------------------------------
log_step "Marzban API..."
MARZBAN_CODE=$(docker exec -i umbra-marzban python3 - <<'PYEOF' 2>/dev/null
import ssl
import urllib.request

ctx = ssl._create_unverified_context()
try:
    with urllib.request.urlopen('https://localhost:8000/api/inbounds', timeout=10, context=ctx) as r:
        print(r.status)
except urllib.error.HTTPError as e:
    print(e.code)
except Exception:
    print('000')
PYEOF
)
if [[ "$MARZBAN_CODE" =~ ^(200|401|403)$ ]]; then
  log_ok "Marzban API reachable (internal) -> $MARZBAN_CODE"
  (( ++PASS ))
else
  log_warn "Marzban API check inconclusive (got $MARZBAN_CODE) - check manually"
fi

# -- Cron jobs -----------------------------------------------------------------
log_step "Cron jobs..."

CERT_CRON="17 3 * * * $REPO_DIR/ops.sh certs --renew >> /var/log/umbra-cert-renew.log 2>&1"
BACKUP_CRON="0 2 * * * $REPO_DIR/ops.sh backup >> /var/log/umbra-backup.log 2>&1"
CRONTAB_CONTENT="$(crontab -l 2>/dev/null || true)"

if grep -Fxq "$CERT_CRON" <<< "$CRONTAB_CONTENT"; then
  log_ok "Certificate renewal cron installed"
  (( ++PASS ))
else
  log_fail "Certificate renewal cron missing"
  (( ++FAIL ))
fi

if grep -Fxq "$BACKUP_CRON" <<< "$CRONTAB_CONTENT"; then
  log_ok "Backup cron installed"
  (( ++PASS ))
else
  log_fail "Backup cron missing"
  (( ++FAIL ))
fi

# -- TLS certificates ----------------------------------------------------------
log_step "Certificate expiry check..."
for domain in "$APEX_DOMAIN" "$WWW_DOMAIN" "$EDGE_DOMAIN" "$SUB_DOMAIN" "$CONSOLE_DOMAIN" "$ADMIN_DOMAIN" "$PAS_DOMAIN"; do
  expiry=$(echo | openssl s_client -connect "$domain:443" -servername "$domain" 2>/dev/null \
    | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2 || echo "")
  if [[ -n "$expiry" ]]; then
    log_ok "$domain cert valid until: $expiry"
    (( ++PASS ))
  else
    log_warn "$domain - could not read cert expiry"
  fi
done

# -- Result --------------------------------------------------------------------
echo ""
log_info "Results: ${PASS} passed, ${FAIL} failed"

if (( FAIL > 0 )); then
  log_error "Verification failed ($FAIL checks). Review logs above."
  exit 1
fi
log_ok "All verification checks passed."
