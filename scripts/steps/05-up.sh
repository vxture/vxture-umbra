#!/usr/bin/env bash
# Start all Docker services
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/env.sh"
source "$SCRIPT_DIR/../lib/log.sh"

log_banner "Umbra — Start Services"

cd "$REPO_DIR"

log_step "Pulling latest images..."
docker compose pull --quiet

log_step "Starting services..."
docker compose up -d

log_step "Waiting for services to initialize (15s)..."
sleep 15

log_step "Container status:"
docker compose ps

# Health check: fail if any service exited or is crash-looping
PROBLEMS=""

for container in umbra-nginx umbra-marzban umbra-vaultwarden umbra-uptime umbra-portal umbra-docs umbra-shortlink; do
  state=$(docker inspect "$container" --format '{{.State.Status}}' 2>/dev/null || echo "missing")
  restarts=$(docker inspect "$container" --format '{{.RestartCount}}' 2>/dev/null || echo "0")

  if [[ "$state" == "exited" ]]; then
    PROBLEMS="$PROBLEMS\n  $container: exited unexpectedly"
  elif [[ "$state" == "restarting" ]] || [[ "$restarts" -gt 2 ]]; then
    PROBLEMS="$PROBLEMS\n  $container: crash-looping (restarts=$restarts)"
  fi
done

if [[ -n "$PROBLEMS" ]]; then
  log_error "Container health check failed:"
  echo -e "$PROBLEMS"
  log_info "Diagnose with: docker compose logs <container-name>"
  exit 1
fi

log_ok "All services started."
