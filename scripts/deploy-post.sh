#!/usr/bin/env bash
# Post-deployment wizard. Run after deploy-all.sh completes.
# Interactive: guides through Marzban user creation, DNS check, and account setup.
#
# Usage:
#   bash scripts/deploy-post.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib/env.sh"
source "$SCRIPT_DIR/lib/log.sh"

if [[ "$EUID" -eq 0 ]]; then
  log_error "Do not run as root. Switch to the admin user: su - stone"
  exit 1
fi

# ── Helpers ───────────────────────────────────────────────────────────────────
prompt() {
  local question="$1"
  local default="$2"
  local answer=""
  if [[ -t 0 ]]; then
    read -r -p "  $question [$default]: " answer
  fi
  echo "${answer:-$default}"
}

confirm() {
  local question="$1"
  local answer=""
  if [[ -t 0 ]]; then
    read -r -p "  $question [y/N]: " answer
  fi
  [[ "${answer,,}" == "y" ]]
}

# Marzban runs HTTPS internally (self-signed cert). All API calls use https://
# with SSL verification disabled (cert is for internal Docker use only).
MARZBAN_API="https://localhost:8000"

log_banner "Umbra — Post-Deploy Wizard"
log_info "Node: $NODE_NAME  ($EDGE_DOMAIN)"
echo ""

# ── [1/4] Marzban Users ───────────────────────────────────────────────────────
log_step "[1/4] Create Marzban Users"
echo ""

USER_COUNT=$(prompt "Number of users to create" "${USER_COUNT:-10}")
USER_PREFIX=$(prompt "Username prefix" "${USER_PREFIX:-user}")

echo ""
log_info "Creating $USER_COUNT users with prefix '$USER_PREFIX'..."
echo ""

# Ensure Marzban admin user exists.
# SUDO_USERNAME/SUDO_PASSWORD env vars create the admin on first startup with an
# empty DB, but this is unreliable across Marzban versions. We explicitly check
# and create the admin via Python+passlib (available inside the container) so
# that deploy-post.sh is idempotent regardless of Marzban startup behaviour.
log_info "Ensuring Marzban admin user exists..."
docker exec -i umbra-marzban python3 - <<PYEOF
import os, sys, sqlite3
try:
    from passlib.context import CryptContext
except ImportError:
    print("passlib not available — skipping admin pre-create", file=sys.stderr)
    sys.exit(0)

db = sqlite3.connect('/var/lib/marzban/db.sqlite3')
username = os.environ.get('SUDO_USERNAME', '')
password = os.environ.get('SUDO_PASSWORD', '')

if not username or not password:
    print("SUDO_USERNAME/SUDO_PASSWORD not set — skipping", file=sys.stderr)
    sys.exit(0)

count = db.execute("SELECT COUNT(*) FROM admins WHERE username=?", (username,)).fetchone()[0]
if count > 0:
    print(f"Admin '{username}' already exists.")
else:
    pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")
    hashed = pwd.hash(password)
    db.execute(
        "INSERT INTO admins (username, hashed_password, is_sudo) VALUES (?, ?, 1)",
        (username, hashed)
    )
    db.commit()
    print(f"Admin '{username}' created.")
db.close()
PYEOF

# Authenticate with Marzban API
MARZBAN_TOKEN=$(docker exec -i umbra-marzban python3 - <<PYEOF
import urllib.request, urllib.parse, json, ssl, sys

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

data = urllib.parse.urlencode({
    'username': '${MARZBAN_ADMIN_USER}',
    'password': '${MARZBAN_ADMIN_PASSWORD}'
}).encode()

try:
    req = urllib.request.Request('${MARZBAN_API}/api/admin/token', data=data)
    with urllib.request.urlopen(req, timeout=10, context=ctx) as r:
        print(json.loads(r.read())['access_token'])
except Exception as e:
    print('ERROR: ' + str(e), file=sys.stderr)
    sys.exit(1)
PYEOF
)

if [[ -z "$MARZBAN_TOKEN" ]]; then
  log_error "Could not authenticate with Marzban API"
  log_error "Admin user: ${MARZBAN_ADMIN_USER}"
  log_info  "Check container: docker compose logs umbra-marzban --tail=20"
  log_info  "Reset admin:     docker exec -it umbra-marzban marzban admin create"
  exit 1
fi

log_ok "Marzban API authenticated"

# Configure inbound host — required for subscription URLs to include proxy nodes.
# Sets the public address, port, SNI and TLS fingerprint for VLESS_TCP_REALITY.
log_info "Configuring Marzban inbound host..."

MARZBAN_HOST_STATUS=$(docker exec -i umbra-marzban python3 - <<PYEOF
import urllib.request, json, ssl, sys

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

payload = json.dumps({
    "VLESS_TCP_REALITY": [{
        "remark": "${NODE_NAME}",
        "address": "${EDGE_DOMAIN}",
        "port": 443,
        "sni": "${REALITY_SNI}",
        "host": None,
        "path": None,
        "security": "inbound_default",
        "alpn": "",
        "fingerprint": "chrome",
        "allowinsecure": False,
        "is_disabled": False,
        "mux_enable": False,
        "fragment_setting": None,
        "noise_setting": None,
        "random_user_agent": False,
        "use_sni_as_host": False
    }]
}).encode()

req = urllib.request.Request(
    '${MARZBAN_API}/api/hosts',
    data=payload,
    method='PUT',
    headers={
        'Authorization': 'Bearer ${MARZBAN_TOKEN}',
        'Content-Type': 'application/json'
    }
)
try:
    with urllib.request.urlopen(req, timeout=10, context=ctx) as r:
        json.loads(r.read())
        print('OK')
except Exception as e:
    print('ERROR: ' + str(e), file=sys.stderr)
    sys.exit(1)
PYEOF
)

if [[ "$MARZBAN_HOST_STATUS" == "OK" ]]; then
  log_ok "Marzban host configured: ${EDGE_DOMAIN}:443 (SNI: ${REALITY_SNI})"
else
  log_warn "Marzban host configuration may have failed — check manually"
fi

CREATED=0
SKIPPED=0
declare -A SUB_URLS

for i in $(seq -w 1 "$USER_COUNT"); do
  username="${USER_PREFIX}${i}"

  exists=$(docker exec -i umbra-marzban python3 - <<PYEOF
import urllib.request, json, ssl, sys

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

req = urllib.request.Request(
    '${MARZBAN_API}/api/user/${username}',
    headers={'Authorization': 'Bearer ${MARZBAN_TOKEN}'}
)
try:
    with urllib.request.urlopen(req, timeout=5, context=ctx) as r:
        data = json.loads(r.read())
        print(data.get('subscription_url', ''))
except urllib.error.HTTPError as e:
    if e.code == 404:
        print('NOT_FOUND')
    else:
        print('ERROR', file=sys.stderr)
        sys.exit(1)
PYEOF
)

  if [[ "$exists" != "NOT_FOUND" ]]; then
    log_info "User $username already exists — skipping"
    SUB_URLS[$username]="${exists}"
    (( ++SKIPPED ))
    continue
  fi

  sub_url=$(docker exec -i umbra-marzban python3 - <<PYEOF
import urllib.request, json, ssl, sys

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

payload = json.dumps({
    "username": "${username}",
    "proxies": {"vless": {"flow": "xtls-rprx-vision"}},
    "inbounds": {"vless": ["VLESS_TCP_REALITY"]},
    "data_limit": 0,
    "expire": None,
    "data_limit_reset_strategy": "no_reset",
    "status": "active"
}).encode()

req = urllib.request.Request(
    '${MARZBAN_API}/api/user',
    data=payload,
    headers={
        'Authorization': 'Bearer ${MARZBAN_TOKEN}',
        'Content-Type': 'application/json'
    }
)
try:
    with urllib.request.urlopen(req, timeout=10, context=ctx) as r:
        data = json.loads(r.read())
        print(data.get('subscription_url', ''))
except Exception as e:
    print('ERROR: ' + str(e), file=sys.stderr)
    sys.exit(1)
PYEOF
)

  SUB_URLS[$username]="${sub_url}"
  log_ok "Created: $username"
  (( ++CREATED ))
done

echo ""
log_info "Users: created=$CREATED  skipped=$SKIPPED"

# ── [2/4] Subscription URLs ───────────────────────────────────────────────────
echo ""
log_step "[2/4] Subscription URLs"
echo "  ┌─────────────────────────────────────────────────────────────────────"
for i in $(seq -w 1 "$USER_COUNT"); do
  username="${USER_PREFIX}${i}"
  echo "  │  $username"
  echo "  │    ${SUB_URLS[$username]}"
  echo "  │"
done
echo "  └─────────────────────────────────────────────────────────────────────"

# Save to file
SUB_FILE="$BACKUP_DIR/subscription-urls-$(date +%Y%m%d).txt"
{
  echo "# Subscription URLs — generated $(date)"
  echo "# Server: $NODE_NAME ($EDGE_DOMAIN)"
  echo ""
  for i in $(seq -w 1 "$USER_COUNT"); do
    username="${USER_PREFIX}${i}"
    echo "$username  ${SUB_URLS[$username]}"
  done
} > "$SUB_FILE"
chmod 600 "$SUB_FILE"
log_ok "Saved to: $SUB_FILE"

# ── [3/4] DNS Checklist ───────────────────────────────────────────────────────
echo ""
log_step "[3/4] DNS Status"

SERVER_IP=$(curl -sf --max-time 5 https://api.ipify.org 2>/dev/null || echo "unknown")
echo ""
echo "  Server IP: $SERVER_IP"
echo ""
echo "  A records that should point to $SERVER_IP:"
echo ""

ALL_DOMAINS=(
  "$APEX_DOMAIN" "$WWW_DOMAIN" "$EDGE_DOMAIN" "$SUB_DOMAIN"
  "$CONSOLE_DOMAIN" "$PASS_DOMAIN" "$VAULT_DOMAIN"
)

DNS_OK=true
for domain in "${ALL_DOMAINS[@]}"; do
  resolved=$(dig +short "$domain" 2>/dev/null | grep -E '^[0-9]+\.' | tail -1 || echo "?")
  if [[ "$resolved" == "$SERVER_IP" ]]; then
    echo "  ✓  $domain  →  $resolved"
  else
    echo "  ✗  $domain  →  $resolved  (needs update)"
    DNS_OK=false
  fi
done

echo ""
if $DNS_OK; then
  log_ok "All domains point to this server."
else
  log_warn "Some domains are not yet pointing to this server."
  echo ""
  echo "  After updating DNS, run:"
  echo "  $ bash scripts/deploy-certs.sh --upgrade"
fi

# ── [4/4] Vaultwarden Account Setup ──────────────────────────────────────────
echo ""
log_step "[4/4] Vaultwarden Account Setup"
echo ""
echo "  Vaultwarden is running at https://$PASS_DOMAIN"
echo ""
echo "  Steps to complete:"
echo "    1. Open the admin panel: https://$PASS_DOMAIN/admin"
echo "       Enter your VAULTWARDEN_ADMIN_TOKEN from .env"
echo "    2. Go to 'Users' -> 'Invite User' and invite yourself by email"
echo "       (Web registration is disabled — accounts must be created via admin panel)"
echo "    3. Open the invitation email link and set your master password"
echo ""

if confirm "Have you created your Vaultwarden account via the admin panel?"; then
  log_ok "Vaultwarden setup confirmed"
else
  log_warn "Action required: set up Vaultwarden before this server goes public"
fi

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
log_step "Manual tasks remaining"
echo ""
echo "  1. External uptime monitoring (recommended):"
echo "     Add a free monitor at betteruptime.com or uptimerobot.com"
echo "       * TCP   $EDGE_DOMAIN:443  (VPN port)"
echo "       * HTTPS https://$EDGE_DOMAIN  (portal)"
echo ""
echo "  2. Distribute subscription URLs to users:"
echo "     Saved in: $SUB_FILE"
echo ""

log_ok "Post-deploy wizard complete."
