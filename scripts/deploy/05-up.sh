#!/usr/bin/env bash
# Start all Docker services
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/env.sh"
source "$SCRIPT_DIR/../lib/log.sh"
source "$SCRIPT_DIR/../lib/certs.sh"

log_banner "Umbra - Start Services"

cd "$REPO_DIR"

# -- Marzban TLS cert ----------------------------------------------------------
# Marzban (newer versions) binds to 127.0.0.1 when no SSL cert is provided,
# making it unreachable from other Docker containers (nginx gets 502).
# Copy the edge cert issued in step 03 so Marzban binds to 0.0.0.0.
# When using self-signed certs, set MARZBAN_SSL_CA_TYPE=private in .env.
# nginx proxies https:// with proxy_ssl_verify off.
if ! umbra_sync_marzban_tls "$DATA_DIR/letsencrypt" "$EDGE_DOMAIN" "$DATA_DIR/marzban/tls"; then
  log_error "Marzban requires /var/lib/marzban/tls/cert.pem and will restart without it."
  log_info  "Run certificate issuance first: bash scripts/deploy.sh certs"
  log_info  "Or upgrade/repair certs:      bash scripts/ops.sh certs --upgrade"
  exit 1
fi

log_step "Pulling latest images..."
docker compose pull --quiet

log_step "Starting services..."
docker compose up -d --build

# Python services mount source files from the repo. Compose does not recreate
# them when only the mounted Python file changes, so restart them explicitly.
log_step "Restarting code-mounted Python services..."
docker compose restart umbra-subproxy umbra-account

log_step "Reloading nginx rendered configuration..."
docker compose exec -T umbra-nginx nginx -t
docker compose exec -T umbra-nginx nginx -s reload

log_step "Waiting for services to initialize (15s)..."
sleep 15

log_step "Container status:"
docker compose ps

# Health check: fail if any service exited or is crash-looping
PROBLEMS=""

for container in umbra-nginx umbra-marzban umbra-subproxy umbra-account umbra-account-web umbra-vaultwarden umbra-portal umbra-website; do
  state=$(docker inspect "$container" --format '{{.State.Status}}' 2>/dev/null || echo "missing")

  if [[ "$state" == "exited" ]]; then
    PROBLEMS="$PROBLEMS\n  $container: exited unexpectedly"
  elif [[ "$state" == "restarting" ]]; then
    PROBLEMS="$PROBLEMS\n  $container: crash-looping (currently restarting)"
  fi
done

if [[ -n "$PROBLEMS" ]]; then
  log_error "Container health check failed:"
  echo -e "$PROBLEMS"
  log_info "Diagnose with: docker compose logs <container-name>"
  exit 1
fi

log_ok "All services started."
