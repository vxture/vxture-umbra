#!/usr/bin/env bash
# Create DATA_DIR and BACKUP_DIR directory structure with correct permissions
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/01-env.sh"
source "$SCRIPT_DIR/../lib/00-log.sh"

if [[ "${1:-}" == "--help" ]] || [[ "${1:-}" == "-h" ]]; then
  echo ""
  echo "  Usage: bash deploy/worker-03/deploy.sh directories"
  echo ""
  echo "  Creates DATA_DIR and BACKUP_DIR directory structure"
  echo "  with correct permissions. Copies nginx.conf and snippets."
  echo ""
  echo "  Called automatically by: bash deploy/worker-03/deploy.sh all"
  echo "  Run standalone:          bash deploy/worker-03/deploy.sh directories"
  echo ""
  exit 0
fi

log_banner "Umbra - Init Directories"

mk() {
  mkdir -p "$1"
  log_ok "mkdir -p $1"
}

# -- Data directories ----------------------------------------------------------
log_step "Creating DATA_DIR structure at $DATA_DIR ..."

mk "$DATA_DIR/nginx/conf.d"
mk "$DATA_DIR/nginx/stream.d"
mk "$DATA_DIR/nginx/private"
mk "$DATA_DIR/nginx/logs"
mk "$DATA_DIR/marzban/templates/clash"
mk "$DATA_DIR/marzban/templates/v2ray"
mk "$DATA_DIR/marzban/logs"
mk "$DATA_DIR/account"
mk "$DATA_DIR/vaultwarden/data"
mk "$DATA_DIR/letsencrypt"
mk "$DATA_DIR/certbot/www/.well-known/acme-challenge"
mk "$DATA_DIR/certbot/config"
mk "$DATA_DIR/certbot/hooks"
mk "$DATA_DIR/private"

# -- Backup directory ----------------------------------------------------------
log_step "Creating BACKUP_DIR at $BACKUP_DIR ..."
mk "$BACKUP_DIR"

# -- Permissions: sensitive directories ---------------------------------------
log_step "Setting permissions on sensitive directories..."

chmod 700 "$DATA_DIR/private"
log_ok "chmod 700 $DATA_DIR/private"

chmod 700 "$DATA_DIR/account"
log_ok "chmod 700 $DATA_DIR/account"

chmod 711 "$DATA_DIR/nginx/private"
log_ok "chmod 711 $DATA_DIR/nginx/private"

chmod 700 "$BACKUP_DIR"
log_ok "chmod 700 $BACKUP_DIR"

# -- Copy nginx.conf (plain file, no templating needed) ------------------------
# Always overwrite so repo changes (e.g. map blocks) propagate to the running config.
REPO_NGINX_CONF="$REPO_DIR/configs/nginx/nginx.conf"
DATA_NGINX_CONF="$DATA_DIR/nginx/nginx.conf"

if [[ -f "$REPO_NGINX_CONF" ]]; then
  cp "$REPO_NGINX_CONF" "$DATA_NGINX_CONF"
  log_ok "Copied nginx.conf to $DATA_NGINX_CONF"
fi

# -- Copy snippet configs ------------------------------------------------------
SNIPPETS_SRC="$REPO_DIR/configs/nginx/snippets"
SNIPPETS_DST="$DATA_DIR/nginx/snippets"
mk "$SNIPPETS_DST"

for f in "$SNIPPETS_SRC"/*.conf; do
  fname="$(basename "$f")"
  cp "$f" "$SNIPPETS_DST/$fname"
  log_ok "Copied snippet: $fname"
done

log_ok "Directory init complete."
