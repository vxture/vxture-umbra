#!/usr/bin/env bash
# Umbra deployment dispatcher — run individual modules on demand.
#
# Usage:
#   bash scripts/deploy.sh <command> [args]
#
# Commands:
#   all [--skip-verify] [--skip-backup]   Full deployment (same as deploy-all.sh)
#   check                                  Validate environment and DNS
#   dirs                                   Initialize data directory structure
#   keys                                   Generate REALITY x25519 keypair
#   certs                                  Issue TLS certificates
#   certs --upgrade                        Upgrade self-signed → trusted LE certs
#   certs --status                         Show certificate expiry for all domains
#   config                                 Re-render config templates + nginx reload
#   up                                     Pull images and start all containers
#   verify                                 Verify all services and endpoints
#   backup                                 Create backup archive
#   post                                   Post-deploy wizard (create VPN users, show sub URLs)
#   reload                                 Reload nginx config without restart
#   restart [service]                      Restart one or all services
#   status                                 Show container status
#   logs [service]                         Tail container logs (Ctrl-C to exit)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib/env.sh"
source "$SCRIPT_DIR/lib/log.sh"

CMD="${1:-}"
shift || true

_usage() {
  echo ""
  echo "  Usage: bash scripts/deploy.sh <command> [args]"
  echo ""
  echo "  Deployment steps:"
  echo "    all [--skip-verify] [--skip-backup]  Full deployment"
  echo "    check                                 Validate environment and DNS"
  echo "    dirs                                  Initialize data directory structure"
  echo "    keys                                  Generate REALITY keypair"
  echo "    certs                                 Issue TLS certificates"
  echo "    certs --upgrade                       Upgrade self-signed → real LE certs"
  echo "    certs --status                        Show certificate expiry"
  echo "    config                                Re-render configs + nginx reload"
  echo "    up                                    Pull images and start containers"
  echo "    verify                                Verify all services"
  echo "    backup                                Create backup"
  echo "    post                                  Post-deploy wizard"
  echo ""
  echo "  Runtime operations:"
  echo "    reload                                Reload nginx (no restart)"
  echo "    restart [service]                     Restart service(s)"
  echo "    status                                Container status"
  echo "    logs [service]                        Tail logs"
  echo ""
  echo "  Examples:"
  echo "    bash scripts/deploy.sh all"
  echo "    bash scripts/deploy.sh all --skip-verify"
  echo "    bash scripts/deploy.sh certs --upgrade"
  echo "    bash scripts/deploy.sh config          # edit template → re-render → reload"
  echo "    bash scripts/deploy.sh restart umbra-marzban"
  echo "    bash scripts/deploy.sh logs umbra-nginx"
  echo ""
}

case "$CMD" in

  all)
    exec bash "$SCRIPT_DIR/deploy-all.sh" "$@"
    ;;

  check)
    exec bash "$SCRIPT_DIR/steps/00-check-env.sh"
    ;;

  dirs)
    exec bash "$SCRIPT_DIR/steps/01-init-dirs.sh"
    ;;

  keys)
    exec bash "$SCRIPT_DIR/steps/02-generate-reality.sh"
    ;;

  certs)
    ARG="${1:-}"
    if [[ "$ARG" == "--upgrade" ]] || [[ "$ARG" == "--status" ]]; then
      exec bash "$SCRIPT_DIR/deploy-certs.sh" "$ARG"
    else
      exec bash "$SCRIPT_DIR/steps/03-issue-certs.sh"
    fi
    ;;

  config)
    log_banner "Umbra — Render Configs"
    python3 "$SCRIPT_DIR/steps/04-render-configs.py"
    echo ""
    log_step "Reloading nginx..."
    if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^${NGINX_CONTAINER}$"; then
      if docker exec "$NGINX_CONTAINER" nginx -t 2>/dev/null; then
        docker exec "$NGINX_CONTAINER" nginx -s reload
        log_ok "Nginx reloaded"
      else
        log_error "Nginx config test failed — fix the error above before reloading"
        exit 1
      fi
    else
      log_warn "Nginx not running — configs rendered but not applied."
      log_warn "Start services with: bash scripts/deploy.sh up"
    fi
    ;;

  up)
    exec bash "$SCRIPT_DIR/steps/05-up.sh"
    ;;

  verify)
    exec bash "$SCRIPT_DIR/steps/06-verify.sh"
    ;;

  backup)
    exec bash "$SCRIPT_DIR/steps/07-backup.sh"
    ;;

  post)
    exec bash "$SCRIPT_DIR/deploy-post.sh"
    ;;

  reload)
    log_step "Testing nginx config..."
    if docker exec "$NGINX_CONTAINER" nginx -t 2>/dev/null; then
      docker exec "$NGINX_CONTAINER" nginx -s reload
      log_ok "Nginx reloaded"
    else
      log_error "Nginx config test failed — not reloaded"
      exit 1
    fi
    ;;

  restart)
    SERVICE="${1:-}"
    cd "$REPO_DIR"
    if [[ -z "$SERVICE" ]]; then
      log_step "Restarting all services..."
      docker compose restart
      log_ok "All services restarted"
    else
      log_step "Restarting $SERVICE..."
      docker compose restart "$SERVICE"
      log_ok "$SERVICE restarted"
    fi
    ;;

  status)
    cd "$REPO_DIR"
    docker compose ps
    ;;

  logs)
    SERVICE="${1:-}"
    cd "$REPO_DIR"
    if [[ -z "$SERVICE" ]]; then
      docker compose logs -f --tail=50
    else
      docker compose logs -f --tail=50 "$SERVICE"
    fi
    ;;

  "")
    _usage
    exit 1
    ;;

  *)
    log_error "Unknown command: $CMD"
    _usage
    exit 1
    ;;

esac
