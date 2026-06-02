#!/usr/bin/env bash
# Start all Docker services
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/01-env.sh"
source "$SCRIPT_DIR/../lib/00-log.sh"
source "$SCRIPT_DIR/../lib/02-certs.sh"

if [[ "${1:-}" == "--help" ]] || [[ "${1:-}" == "-h" ]]; then
  echo ""
  echo "  Usage: bash deploy/worker-03/deploy.sh start"
  echo ""
  echo "  Pulls images, starts all Docker services, syncs Marzban TLS,"
  echo "  reloads nginx, and polls for container health."
  echo ""
  echo "  Called automatically by: bash deploy/worker-03/deploy.sh all"
  echo "  Run standalone:          bash deploy/worker-03/deploy.sh start"
  echo ""
  exit 0
fi

log_banner "Umbra - Start Services"

cd "$REPO_DIR"

pull_images_for_current_registry() {
  local image attempt
  local -a images
  local pull_timeout="${DOCKER_PULL_TIMEOUT_SECONDS:-90}"
  mapfile -t images < <(docker compose config --images | sed '/^[[:space:]]*$/d')

  for image in "${images[@]}"; do
    log_info "Pulling $image"
    for attempt in 1 2 3; do
      if timeout "$pull_timeout" docker pull --quiet "$image"; then
        break
      fi

      if [[ "$attempt" -eq 3 ]]; then
        log_error "docker pull failed after retries: $image"
        return 1
      fi

      log_warn "docker pull failed or timed out for $image on attempt $attempt; retrying..."
      sleep $((attempt * 5))
    done
  done
}

compose_pull_with_retry() {
  local primary_registry="${IMAGE_REGISTRY:-}"
  local primary_namespace="${IMAGE_NAMESPACE:-}"

  if pull_images_for_current_registry; then
    return 0
  fi

  if [[ -n "${FALLBACK_IMAGE_REGISTRY:-}" && -n "${FALLBACK_IMAGE_NAMESPACE:-}" ]]; then
    if [[ "${FALLBACK_IMAGE_REGISTRY}" != "$primary_registry" || "${FALLBACK_IMAGE_NAMESPACE}" != "$primary_namespace" ]]; then
      log_warn "Primary image registry failed; retrying with fallback ${FALLBACK_IMAGE_REGISTRY}/${FALLBACK_IMAGE_NAMESPACE}"
      export IMAGE_REGISTRY="$FALLBACK_IMAGE_REGISTRY"
      export IMAGE_NAMESPACE="$FALLBACK_IMAGE_NAMESPACE"
      pull_images_for_current_registry
      return $?
    fi
  fi

  return 1
}

# -- Marzban TLS cert ----------------------------------------------------------
# Marzban (newer versions) binds to 127.0.0.1 when no SSL cert is provided,
# making it unreachable from other Docker containers (nginx gets 502).
# Copy the edge cert issued in step 03 so Marzban binds to 0.0.0.0.
# When using self-signed certs, set MARZBAN_SSL_CA_TYPE=private in .env.
# nginx proxies https:// with proxy_ssl_verify off.
if ! umbra_sync_marzban_tls "$DATA_DIR/letsencrypt" "$EDGE_DOMAIN" "$DATA_DIR/marzban/tls"; then
  log_error "Marzban requires /var/lib/marzban/tls/cert.pem and will restart without it."
  log_info  "Run certificate issuance first: bash deploy/worker-03/deploy.sh certificates"
  log_info  "Or upgrade/repair certs:      bash deploy/worker-03/ops.sh certs --upgrade"
  exit 1
fi

log_step "Pulling latest images..."
compose_pull_with_retry

log_step "Starting services..."
docker compose up -d

log_step "Reloading nginx rendered configuration..."
docker compose exec -T umbra-nginx nginx -t
docker compose exec -T umbra-nginx nginx -s reload

log_step "Waiting for services to become healthy..."
HEALTH_CHECK_TIMEOUT=60     # max seconds to wait
HEALTH_CHECK_INTERVAL=3     # seconds between polls
MAX_RETRIES=$((HEALTH_CHECK_TIMEOUT / HEALTH_CHECK_INTERVAL))
poll_count=0

containers=("umbra-nginx" "umbra-marzban" "umbra-subproxy" "umbra-account" "umbra-account-web" "umbra-vaultwarden" "umbra-website" "umbra-admin")

while [[ $poll_count -lt $MAX_RETRIES ]]; do
  all_healthy=true
  for c in "${containers[@]}"; do
    status=$(docker inspect "$c" --format '{{.State.Status}}' 2>/dev/null || echo "missing")
    health=$(docker inspect "$c" --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' 2>/dev/null || echo "none")

    if [[ "$status" != "running" ]]; then
      all_healthy=false
      break
    fi

    # If container has a health check, require "healthy"; otherwise just "running" is enough
    if [[ "$health" != "none" && "$health" != "healthy" ]]; then
      all_healthy=false
      break
    fi
  done

  if [[ "$all_healthy" == "true" ]]; then
    log_ok "All containers healthy after ${poll_count}s polling."
    break
  fi

  poll_count=$((poll_count + 1))
  if [[ $poll_count -lt $MAX_RETRIES ]]; then
    sleep "$HEALTH_CHECK_INTERVAL"
  fi
done

if [[ "$all_healthy" != "true" ]]; then
  log_warn "Some containers not healthy after ${HEALTH_CHECK_TIMEOUT}s. Continuing anyway - check status below."
fi

log_step "Container status:"
docker compose ps

# Health check: fail if any service exited or is crash-looping
PROBLEMS=""

for container in umbra-nginx umbra-marzban umbra-subproxy umbra-account umbra-account-web umbra-vaultwarden umbra-website umbra-admin; do
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
