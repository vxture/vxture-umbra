#!/usr/bin/env bash
# Operations lifecycle dispatcher.
#
# Usage:
#   bash deploy/worker-03/ops.sh <command> [args]
#
# Commands:
#   status                         Show container status
#   logs [service]                 Tail container logs
#   restart [service]              Restart one or all services
#   reload                         Reload nginx config without restart
#   backup                         Create backup archive
#   certs --status                 Show certificate expiry
#   certs --renew                  Run renewal check
#   certs --upgrade                Replace self-signed certs with trusted LE certs
#   certs --clean-renewal-state    Remove invalid zero-byte renewal configs
#   certs --clean-workdirs         Remove obsolete certificate work directories
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

CMD="${1:-}"
shift || true

_usage() {
  echo ""
  echo "  Usage: bash deploy/worker-03/ops.sh <command> [args]"
  echo ""
  echo "  Purpose:"
  echo "    Operate an already deployed worker-03 runtime."
  echo "    These commands should not bootstrap a fresh server or change release state."
  echo ""
  echo "  Runtime operations:"
  echo "    status                                Container status"
  echo "    logs [service]                        Tail logs"
  echo "    restart [service]                     Restart service(s)"
  echo "    reload                                Reload nginx (no restart)"
  echo "    backup                                Create backup"
  echo "    certs --status                        Show certificate expiry"
  echo "    certs --renew                         Run certificate renewal check"
  echo "    certs --upgrade                       Upgrade self-signed -> real LE certs"
  echo "    certs --clean-renewal-state           Remove invalid zero-byte renewal configs"
  echo "    certs --clean-workdirs                Remove obsolete certificate workdirs"
  echo "    certs --clean-retired-lineages        Remove non-active certbot lineages"
  echo ""
}

case "$CMD" in
  ""|-h|--help|help)
    _usage
    exit 0
    ;;
esac

source "$SCRIPT_DIR/lib/01-env.sh"
source "$SCRIPT_DIR/lib/00-log.sh"

case "$CMD" in

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

  reload)
    log_step "Testing nginx config..."
    if nginx_test_output="$(docker exec "$NGINX_CONTAINER" nginx -t 2>&1)"; then
      printf '%s\n' "$nginx_test_output"
      docker exec "$NGINX_CONTAINER" nginx -s reload
      log_ok "Nginx reloaded"
    else
      printf '%s\n' "$nginx_test_output" >&2
      log_error "Nginx config test failed; nginx was not reloaded"
      exit 1
    fi
    ;;

  backup)
    exec bash "$SCRIPT_DIR/scripts/55-backup-runtime-state.sh"
    ;;

  certs)
    exec bash "$SCRIPT_DIR/scripts/53-manage-certificates.sh" "$@"
    ;;

  "")
    _usage
    exit 1
    ;;

  *)
    log_error "Unknown ops command: $CMD"
    _usage
    exit 1
    ;;

esac
