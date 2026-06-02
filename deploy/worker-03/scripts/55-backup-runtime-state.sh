#!/usr/bin/env bash
# Create a timestamped backup of all runtime configs and database dumps
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/01-env.sh"
source "$SCRIPT_DIR/../lib/00-log.sh"

if [[ "${1:-}" == "--help" ]] || [[ "${1:-}" == "-h" ]]; then
  echo ""
  echo "  Usage: bash deploy/worker-03/ops.sh backup"
  echo ""
  echo "  Creates timestamped backup archives of all runtime data:"
  echo "    - .env file"
  echo "    - SQLite databases (Marzban)"
  echo "    - Vaultwarden data (DB + attachments)"
  echo "    - Account portal data"
  echo "    - Let's Encrypt certificate state"
  echo "    - Nginx configs, Xray config, REALITY keys"
  echo "    - Crontab"
  echo ""
  echo "  Archives older than 30 days are automatically pruned."
  echo ""
  echo "  Run: bash deploy/worker-03/ops.sh backup"
  echo ""
  exit 0
fi

log_banner "Umbra - Backup"

TIMESTAMP=$(date +%Y%m%d-%H%M%S)
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

ARCHIVE="$BACKUP_DIR/umbra-config-${TIMESTAMP}.tar.gz"

# -- Environment ---------------------------------------------------------------
log_step "Backing up environment file..."
ENV_BACKUP="$BACKUP_DIR/env-${TIMESTAMP}.txt"
if [[ -f "$REPO_DIR/.env" ]]; then
  cp "$REPO_DIR/.env" "$ENV_BACKUP"
  chmod 600 "$ENV_BACKUP"
  log_ok "Environment -> $(basename "$ENV_BACKUP")"
else
  log_warn "Environment file not found at $REPO_DIR/.env - skipping"
fi

# -- SQLite database copies ----------------------------------------------------
log_step "Backing up SQLite databases..."

declare -A SQLITE_DBS=(
  ["marzban"]="$DATA_DIR/marzban/db.sqlite3"
)

for label in marzban; do
  db_path="${SQLITE_DBS[$label]}"
  dest="$BACKUP_DIR/${label}-db-${TIMESTAMP}.sqlite3"
  if [[ -f "$db_path" ]]; then
    cp "$db_path" "$dest"
    chmod 600 "$dest"
    log_ok "Backed up $label -> $(basename "$dest")"
  else
    log_warn "$label database not found at $db_path - skipping"
  fi
done

# -- Vaultwarden full data backup -----------------------------------------------
# Must archive the whole directory: SQLite holds metadata, but attachments and
# Send files are stored as blobs in data/attachments/ and data/sends/.
# A DB-only backup leaves all file attachments unrecoverable.
log_step "Backing up Vaultwarden data (DB + attachments + sends)..."
VW_DATA="$DATA_DIR/vaultwarden/data"
if [[ -d "$VW_DATA" ]]; then
  VW_ARCHIVE="$BACKUP_DIR/vaultwarden-data-${TIMESTAMP}.tar.gz"
  tar -czf "$VW_ARCHIVE" -C "$(dirname "$VW_DATA")" "$(basename "$VW_DATA")" 2>/dev/null
  chmod 600 "$VW_ARCHIVE"
  SIZE=$(du -sh "$VW_ARCHIVE" | cut -f1)
  log_ok "Vaultwarden data -> $(basename "$VW_ARCHIVE") ($SIZE)"
else
  log_warn "Vaultwarden data dir not found at $VW_DATA - skipping"
fi

# -- Account portal data -------------------------------------------------------
log_step "Backing up account portal data..."
ACCOUNT_DATA="$DATA_DIR/account"
if [[ -d "$ACCOUNT_DATA" ]]; then
  ACCOUNT_ARCHIVE="$BACKUP_DIR/account-data-${TIMESTAMP}.tar.gz"
  HOST_UID="$(id -u)"
  HOST_GID="$(id -g)"
  docker run --rm \
    -v "$ACCOUNT_DATA:/data/account:ro" \
    -v "$BACKUP_DIR:/backup" \
    -e OUT="/backup/$(basename "$ACCOUNT_ARCHIVE")" \
    -e HOST_UID="$HOST_UID" \
    -e HOST_GID="$HOST_GID" \
    alpine sh -c '
      set -eu
      tar -czf "$OUT" -C /data account
      chown "$HOST_UID:$HOST_GID" "$OUT"
      chmod 600 "$OUT"
    '
  if tar -tzf "$ACCOUNT_ARCHIVE" >/dev/null 2>&1; then
    SIZE=$(du -sh "$ACCOUNT_ARCHIVE" | cut -f1)
    log_ok "Account portal data -> $(basename "$ACCOUNT_ARCHIVE") ($SIZE)"
  else
    log_error "Account portal archive failed integrity check: $ACCOUNT_ARCHIVE"
    exit 1
  fi
else
  log_warn "Account portal data dir not found at $ACCOUNT_DATA - skipping"
fi

# -- Let's Encrypt certificate state ------------------------------------------
# Certbot writes private keys as root from inside Docker. Archive this tree from
# a root container, then hand ownership back to the deploy user.
log_step "Backing up Let's Encrypt state..."
LE_DIR="$DATA_DIR/letsencrypt"
if [[ -d "$LE_DIR" ]]; then
  LE_ARCHIVE="$BACKUP_DIR/letsencrypt-state-${TIMESTAMP}.tar.gz"
  HOST_UID="$(id -u)"
  HOST_GID="$(id -g)"
  docker run --rm \
    -v "$LE_DIR:/data/letsencrypt:ro" \
    -v "$BACKUP_DIR:/backup" \
    -e OUT="/backup/$(basename "$LE_ARCHIVE")" \
    -e HOST_UID="$HOST_UID" \
    -e HOST_GID="$HOST_GID" \
    alpine sh -c '
      set -eu
      tar -czf "$OUT" -C /data letsencrypt
      chown "$HOST_UID:$HOST_GID" "$OUT"
      chmod 600 "$OUT"
    '
  if tar -tzf "$LE_ARCHIVE" >/dev/null 2>&1; then
    key_count=$(tar -tzf "$LE_ARCHIVE" | grep -Ec '^letsencrypt/(archive/.+/privkey[0-9]+\.pem|live/.+/privkey\.pem)$' || true)
    SIZE=$(du -sh "$LE_ARCHIVE" | cut -f1)
    log_ok "Let's Encrypt state -> $(basename "$LE_ARCHIVE") ($SIZE, private_keys=$key_count)"
  else
    log_error "Let's Encrypt archive failed integrity check: $LE_ARCHIVE"
    exit 1
  fi
else
  log_warn "Let's Encrypt state dir not found at $LE_DIR - skipping"
fi

# -- Config archive -------------------------------------------------------------
log_step "Archiving configs and private data..."

# Items to include in the config archive (excluding DB data files for size)
BACKUP_ITEMS=(
  "$DATA_DIR/nginx/conf.d"
  "$DATA_DIR/nginx/stream.d"
  "$DATA_DIR/nginx/nginx.conf"
  "$DATA_DIR/nginx/private"
  "$DATA_DIR/marzban/templates"
  "$DATA_DIR/marzban/xray_config.json"
  "$DATA_DIR/private"
)

EXISTING_ITEMS=()
for item in "${BACKUP_ITEMS[@]}"; do
  [[ -e "$item" ]] && EXISTING_ITEMS+=("${item#$DATA_DIR/}")
done

if [[ ${#EXISTING_ITEMS[@]} -gt 0 ]]; then
  tar -czf "$ARCHIVE" -C "$DATA_DIR" "${EXISTING_ITEMS[@]}" 2>/dev/null
  chmod 600 "$ARCHIVE"
  SIZE=$(du -sh "$ARCHIVE" | cut -f1)
  log_ok "Config archive: $(basename "$ARCHIVE") ($SIZE)"
else
  log_warn "No config items found to archive"
fi

# -- Crontab --------------------------------------------------------------------
log_step "Saving crontab..."
CRON_FILE="$BACKUP_DIR/root-crontab-${TIMESTAMP}.txt"
crontab -l 2>/dev/null > "$CRON_FILE" || echo "# no crontab" > "$CRON_FILE"
chmod 600 "$CRON_FILE"
log_ok "Crontab saved -> $(basename "$CRON_FILE")"

# -- Retention: delete archives older than 30 days -----------------------------
log_step "Cleaning up archives older than 30 days..."
DELETED=0
while IFS= read -r -d '' f; do
  if rm -f -- "$f"; then
    log_info "Removed: $(basename "$f")"
    DELETED=1
  fi
done < <(
  find "$BACKUP_DIR" -type f \( -name "*.tar.gz" -o -name "*.sqlite3" -o -name "*.txt" \) -mtime +30 -print0 2>/dev/null
)

if [[ "$DELETED" == "0" ]]; then
  log_info "No old archives to remove"
fi

# -- Summary --------------------------------------------------------------------
echo ""
log_ok "Backup complete. Files in $BACKUP_DIR:"
ls -lh "$BACKUP_DIR" | tail -20
