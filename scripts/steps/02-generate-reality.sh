#!/usr/bin/env bash
# Generate REALITY keypair and shortId, save to DATA_DIR/private/reality.json
# Skips if file already exists (preserves existing client configs)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/env.sh"
source "$SCRIPT_DIR/../lib/log.sh"

log_banner "Umbra — Generate REALITY Keys"

REALITY_FILE="$DATA_DIR/private/reality.json"

if [[ -f "$REALITY_FILE" ]]; then
  log_info "reality.json already exists — skipping key generation"
  log_info "To regenerate: rm $REALITY_FILE && re-run this script"
  exit 0
fi

log_step "Generating REALITY x25519 keypair via Xray..."

# Use Marzban's Xray binary (inside a temporary container) to generate keys
XRAY_OUTPUT=$(docker run --rm gozargah/marzban:latest \
  /usr/local/bin/xray x25519 2>/dev/null)

PRIVATE_KEY=$(echo "$XRAY_OUTPUT" | grep "Private key:" | awk '{print $3}')
PUBLIC_KEY=$(echo  "$XRAY_OUTPUT" | grep "Public key:"  | awk '{print $3}')

if [[ -z "$PRIVATE_KEY" ]] || [[ -z "$PUBLIC_KEY" ]]; then
  log_error "Failed to parse x25519 output:"
  echo "$XRAY_OUTPUT"
  exit 1
fi

log_ok "Private key generated"
log_ok "Public key:  $PUBLIC_KEY"

log_step "Generating 4 shortIds (${REALITY_SHORT_ID_LENGTH} hex chars each)..."
SID1=$(openssl rand -hex "$((REALITY_SHORT_ID_LENGTH / 2))")
SID2=$(openssl rand -hex "$((REALITY_SHORT_ID_LENGTH / 2))")
SID3=$(openssl rand -hex "$((REALITY_SHORT_ID_LENGTH / 2))")
SID4=$(openssl rand -hex "$((REALITY_SHORT_ID_LENGTH / 2))")
log_ok "ShortIds: $SID1  $SID2  $SID3  $SID4"

log_step "Writing to $REALITY_FILE ..."

cat > "$REALITY_FILE" <<EOF
{
  "private_key": "$PRIVATE_KEY",
  "public_key":  "$PUBLIC_KEY",
  "short_id":    "$SID1",
  "short_ids":   ["$SID1", "$SID2", "$SID3", "$SID4"],
  "dest":        "$REALITY_DEST",
  "sni":         "$REALITY_SNI"
}
EOF

chmod 600 "$REALITY_FILE"
log_ok "reality.json written (chmod 600)"
log_info "Public key (distribute to clients): $PUBLIC_KEY"
