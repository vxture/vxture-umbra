#!/usr/bin/env bash
# Create a timestamped backup of all runtime configs and database dumps
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/env.sh"
source "$SCRIPT_DIR/../lib/log.sh"

log_banner "Umbra — Backup"

TIMESTAMP=$(date +%Y%m%d-%H%M%S)
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

ARCHIVE="$BACKUP_DIR/umbra-config-${TIMESTAMP}.tar.gz"

# ── SQLite database copies ────────────────────────────────────────────────────
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
    log_ok "Backed up $label → $(basename "$dest")"
  else
    log_warn "$label database not found at $db_path — skipping"
  fi
done

# ── Vaultwarden full data backup ───────────────────────────────────────────────
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
  log_ok "Vaultwarden data → $(basename "$VW_ARCHIVE") ($SIZE)"
else
  log_warn "Vaultwarden data dir not found at $VW_DATA — skipping"
fi

# ── Config archive ─────────────────────────────────────────────────────────────
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
  [[ -e "$item" ]] && EXISTING_ITEMS+=("$item")
done

if [[ ${#EXISTING_ITEMS[@]} -gt 0 ]]; then
  tar -czf "$ARCHIVE" "${EXISTING_ITEMS[@]}" 2>/dev/null
  chmod 600 "$ARCHIVE"
  SIZE=$(du -sh "$ARCHIVE" | cut -f1)
  log_ok "Config archive: $(basename "$ARCHIVE") ($SIZE)"
else
  log_warn "No config items found to archive"
fi

# ── Crontab ────────────────────────────────────────────────────────────────────
log_step "Saving crontab..."
CRON_FILE="$BACKUP_DIR/root-crontab-${TIMESTAMP}.txt"
crontab -l 2>/dev/null > "$CRON_FILE" || echo "# no crontab" > "$CRON_FILE"
chmod 600 "$CRON_FILE"
log_ok "Crontab saved → $(basename "$CRON_FILE")"

# ── Retention: delete archives older than 30 days ─────────────────────────────
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

# ── Summary ────────────────────────────────────────────────────────────────────
echo ""
log_ok "Backup complete. Files in $BACKUP_DIR:"
ls -lh "$BACKUP_DIR" | tail -20
