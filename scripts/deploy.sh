#!/usr/bin/env bash
# Deployment lifecycle dispatcher.
#
# Usage:
#   bash scripts/deploy.sh <command> [args]
#
# Commands:
#   all [--skip-verify] [--skip-backup]   Full deployment pipeline
#   check                                  Validate environment and DNS
#   dirs                                   Initialize data directory structure
#   keys                                   Generate REALITY x25519 keypair
#   certs                                  Issue initial TLS certificates
#   config                                 Re-render config templates + nginx reload
#   up                                     Pull images and start containers
#   verify                                 Verify all services and endpoints
#   post                                   Post-deploy wizard
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
  echo "  Deployment lifecycle:"
  echo "    all [--skip-verify] [--skip-backup]  Full deployment"
  echo "    check                                 Validate environment and DNS"
  echo "    dirs                                  Initialize data directory structure"
  echo "    keys                                  Generate REALITY keypair"
  echo "    certs                                 Issue initial TLS certificates"
  echo "    config                                Re-render configs + nginx reload"
  echo "    up                                    Pull images and start containers"
  echo "    verify                                Verify all services"
  echo "    post                                  Post-deploy wizard"
  echo ""
  echo "  Operational commands moved to:"
  echo "    bash scripts/ops.sh <status|logs|restart|reload|backup|certs>"
  echo ""
}

case "$CMD" in

  all)
    exec bash "$SCRIPT_DIR/deploy/all.sh" "$@"
    ;;

  check)
    exec bash "$SCRIPT_DIR/deploy/00-check-env.sh"
    ;;

  dirs)
    exec bash "$SCRIPT_DIR/deploy/01-init-dirs.sh"
    ;;

  keys)
    exec bash "$SCRIPT_DIR/deploy/02-generate-reality.sh"
    ;;

  certs)
    exec bash "$SCRIPT_DIR/deploy/03-issue-certs.sh"
    ;;

  config)
    log_banner "Umbra — Render Configs"
    python3 "$SCRIPT_DIR/deploy/04-render-configs.py"
    echo ""
    log_step "Reloading nginx..."
    if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^${NGINX_CONTAINER}$"; then
      if nginx_test_output="$(docker exec "$NGINX_CONTAINER" nginx -t 2>&1)"; then
        printf '%s\n' "$nginx_test_output"
        docker exec "$NGINX_CONTAINER" nginx -s reload
        log_ok "Nginx reloaded"
      else
        printf '%s\n' "$nginx_test_output" >&2
        log_error "Nginx config test failed. Configs were rendered but nginx was not reloaded."
        if printf '%s\n' "$nginx_test_output" | grep -q "/etc/letsencrypt/live/"; then
          log_info "A referenced certificate may be missing. Check cert status:"
          log_info "  bash scripts/ops.sh certs --status"
          log_info "Then issue/upgrade certs before reloading:"
          log_info "  bash scripts/ops.sh certs --upgrade"
        fi
        exit 1
      fi
    else
      log_warn "Nginx not running — configs rendered but not applied."
      log_warn "Start services with: bash scripts/deploy.sh up"
    fi
    ;;

  up)
    exec bash "$SCRIPT_DIR/deploy/05-up.sh"
    ;;

  verify)
    exec bash "$SCRIPT_DIR/deploy/06-verify.sh"
    ;;

  post)
    exec bash "$SCRIPT_DIR/deploy/post.sh"
    ;;

  "")
    _usage
    exit 1
    ;;

  backup|status|logs|reload|restart)
    log_error "'$CMD' is an operations command."
    log_info "Use: bash scripts/ops.sh $CMD $*"
    exit 1
    ;;

  *)
    log_error "Unknown deploy command: $CMD"
    _usage
    exit 1
    ;;

esac
