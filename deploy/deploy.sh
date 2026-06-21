#!/usr/bin/env bash
# Deployment lifecycle dispatcher.
#
# Usage:
#   bash deploy/deploy.sh <command> [args]
#
# Commands (new canonical names):
#   all [--skip-verify] [--skip-backup]   Full deployment pipeline
#   environment                            Validate environment and DNS
#   directories                            Initialize data directory structure
#   reality-keys                           Generate REALITY x25519 keypair
#   certificates                           Issue initial TLS certificates
#   config                                 Re-render config templates + nginx reload
#   start                                  Pull images and start containers
#   verify                                 Verify all services and endpoints
#   wizard                                 Post-deploy interactive wizard
#
# Legacy aliases (maintained for muscle memory):
#   check        -> environment
#   dirs         -> directories
#   keys         -> reality-keys
#   certs        -> certificates
#   up           -> start
#   post         -> wizard
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

CMD="${1:-}"
shift || true

_usage() {
  echo ""
  echo "  Usage: bash deploy/deploy.sh <command> [args]"
  echo ""
  echo "  Purpose:"
  echo "    Deploy the production runtime from repository source and environment values."
  echo "    This is the entrypoint used by GitHub Actions after docker-build succeeds."
  echo ""
  echo "  Deployment lifecycle:"
  echo "    all [--skip-verify] [--skip-backup] Full deployment pipeline"
  echo "    environment                         Validate environment and DNS"
  echo "    directories                         Initialize data directory structure"
  echo "    reality-keys                        Generate REALITY keypair"
  echo "    certificates                        Issue initial TLS certificates"
  echo "    config                              Re-render configs + nginx reload"
  echo "    start                               Pull images and start containers"
  echo "    verify                              Verify all services"
  echo "    wizard                              Post-deploy interactive wizard"
  echo ""
  echo "  CI/CD path:"
  echo "    docker-build success -> deploy.sh all -> deploy.sh verify"
  echo ""
  echo "  Legacy aliases (still accepted):"
  echo "    check|dirs|keys|certs|up|post"
  echo ""
  echo "  Operational commands moved to:"
  echo "    bash deploy/ops.sh <status|logs|restart|reload|backup|certs>"
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

check_rendered_nginx_cert_paths() {
  local conf_dir="$RUNTIME_DIR/nginx/conf.d"
  local cert_path host_path
  local failures=0

  if [[ ! -d "$conf_dir" ]]; then
    log_warn "Rendered nginx vhost directory not found: $conf_dir"
    return 0
  fi

  while IFS= read -r cert_path; do
    [[ -z "$cert_path" ]] && continue
    if [[ "$cert_path" != /etc/letsencrypt/* ]]; then
      continue
    fi

    host_path="$DATA_DIR/letsencrypt/${cert_path#/etc/letsencrypt/}"
    if [[ ! -f "$host_path" ]]; then
      log_fail "Missing certificate file required by rendered nginx config: $host_path"
      (( ++failures ))
    fi
  done < <(
    grep -hE '^[[:space:]]*ssl_certificate(_key)?[[:space:]]+' "$conf_dir"/*.conf 2>/dev/null \
      | awk '{print $2}' \
      | sed 's/;//' \
      | sort -u
  )

  if (( failures > 0 )); then
    log_error "Rendered nginx config references missing certificate files."
    log_info "Issue or upgrade certificates before reloading:"
    log_info "  bash deploy/ops.sh certs --upgrade"
    return 1
  fi
}

case "$CMD" in

  all)
    exec bash "$SCRIPT_DIR/scripts/30-run-full-deployment.sh" "$@"
    ;;

  # -- New canonical names -------------------------------------------------------
  environment)
    exec bash "$SCRIPT_DIR/scripts/11-check-runtime-environment.sh"
    ;;

  directories)
    exec bash "$SCRIPT_DIR/scripts/12-prepare-runtime-directories.sh"
    ;;

  reality-keys)
    exec bash "$SCRIPT_DIR/scripts/13-generate-runtime-secrets.sh"
    ;;

  certificates)
    exec bash "$SCRIPT_DIR/scripts/20-issue-tls-certificates.sh"
    ;;

  config)
    log_banner "Umbra - Render Configs"
    python3 "$SCRIPT_DIR/scripts/22-render-runtime-configs.py"
    echo ""
    check_rendered_nginx_cert_paths
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
          log_info "  bash deploy/ops.sh certs --status"
          log_info "Then issue/upgrade certs before reloading:"
          log_info "  bash deploy/ops.sh certs --upgrade"
        fi
        exit 1
      fi
    else
      log_warn "Nginx not running - configs rendered but not applied."
      log_warn "Start services with: bash deploy/deploy.sh start"
    fi
    ;;

  start)
    exec bash "$SCRIPT_DIR/scripts/23-start-docker-services.sh"
    ;;

  verify)
    exec bash "$SCRIPT_DIR/scripts/24-verify-deployment.sh"
    ;;

  wizard)
    exec bash "$SCRIPT_DIR/scripts/25-run-post-deploy-wizard.sh"
    ;;

  # -- Legacy aliases -------------------------------------------------------------
  check)
    log_warn "'check' is deprecated. Use: bash deploy/deploy.sh environment"
    exec bash "$SCRIPT_DIR/scripts/11-check-runtime-environment.sh"
    ;;

  dirs)
    log_warn "'dirs' is deprecated. Use: bash deploy/deploy.sh directories"
    exec bash "$SCRIPT_DIR/scripts/12-prepare-runtime-directories.sh"
    ;;

  keys)
    log_warn "'keys' is deprecated. Use: bash deploy/deploy.sh reality-keys"
    exec bash "$SCRIPT_DIR/scripts/13-generate-runtime-secrets.sh"
    ;;

  certs)
    log_warn "'certs' is deprecated. Use: bash deploy/deploy.sh certificates"
    exec bash "$SCRIPT_DIR/scripts/20-issue-tls-certificates.sh"
    ;;

  up)
    log_warn "'up' is deprecated. Use: bash deploy/deploy.sh start"
    exec bash "$SCRIPT_DIR/scripts/23-start-docker-services.sh"
    ;;

  post)
    log_warn "'post' is deprecated. Use: bash deploy/deploy.sh wizard"
    exec bash "$SCRIPT_DIR/scripts/25-run-post-deploy-wizard.sh"
    ;;

  "")
    _usage
    exit 1
    ;;

  backup|status|logs|reload|restart)
    log_error "'$CMD' is an operations command."
    log_info "Use: bash deploy/ops.sh $CMD $*"
    exit 1
    ;;

  *)
    log_error "Unknown deploy command: $CMD"
    _usage
    exit 1
    ;;

esac
