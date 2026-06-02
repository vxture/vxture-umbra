#!/usr/bin/env bash
# Certificate helpers shared by deployment and operations scripts.

# CERT-011: Never build certificate paths from unvalidated input. A malformed
# domain can otherwise turn a scoped rm into a directory-wide delete.
umbra_validate_cert_domain() {
  local domain="${1:-}"

  if [[ -z "$domain" ]]; then
    log_error "Certificate domain is empty."
    return 1
  fi

  if [[ ! "$domain" =~ ^[A-Za-z0-9.-]+$ ]] \
     || [[ "$domain" == .* ]] \
     || [[ "$domain" == *. ]] \
     || [[ "$domain" == *..* ]]; then
    log_error "Invalid certificate domain: $domain"
    return 1
  fi
}

umbra_collect_active_cert_domains() {
  printf '%s\n' \
    "$APEX_DOMAIN" \
    "$WWW_DOMAIN" \
    "$EDGE_DOMAIN" \
    "$SUB_DOMAIN" \
    "$CONSOLE_DOMAIN" \
    "$ADMIN_DOMAIN" \
    "$PASS_DOMAIN"
}

umbra_collect_cert_domains() {
  local -A seen=()
  local domain

  while IFS= read -r domain; do
    [[ -z "$domain" ]] && continue
    if [[ -z "${seen[$domain]+x}" ]]; then
      printf '%s\n' "$domain"
      seen[$domain]=1
    fi
  done < <(
    umbra_collect_active_cert_domains
  )
}

# Work directories are safe to inspect from the host but may contain root-owned
# files from Certbot containers, so Docker is the consistent read path.
umbra_list_cert_workdirs() {
  local data_dir="$1"

  if [[ ! -d "$data_dir" ]]; then
    return 0
  fi

  docker run --rm \
    -v "$data_dir:/data:ro" \
    alpine sh -c '
      set -eu
      for dir in /data/letsencrypt.staged /data/letsencrypt.new.* /data/letsencrypt.failed.* /data/letsencrypt.backup.*; do
        [ -d "$dir" ] && basename "$dir"
      done | sort
    ' 2>/dev/null || true
}

# Older code used timestamped letsencrypt.new.* directories and deleted them on
# failed runs. Keep the newest legacy staged directory if it exists, because it
# may contain already-issued LE certs that must not be requested again.
umbra_migrate_legacy_staged_certs() {
  local data_dir="$1"
  local output

  if [[ ! -d "$data_dir" ]]; then
    return 0
  fi

  output="$(docker run --rm \
    -v "$data_dir:/data" \
    alpine sh -c '
      set -eu
      staged="/data/letsencrypt.staged"

      if [ -d "$staged" ]; then
        exit 0
      fi

      legacy="$(for dir in /data/letsencrypt.new.*; do [ -d "$dir" ] && echo "$dir"; done | sort | tail -n 1 || true)"
      if [ -n "$legacy" ]; then
        mv "$legacy" "$staged"
        echo "migrated:${legacy#/data/}:letsencrypt.staged"
      fi
    ' 2>/dev/null || true)"

  if [[ -n "$output" ]]; then
    while IFS=: read -r action from to; do
      [[ "$action" == "migrated" ]] && log_warn "Migrated legacy staged cert workdir: $from -> $to"
    done <<< "$output"
  fi
}

# Remove only obsolete work directories. Production certs and timestamped
# backups are deliberately excluded from this cleanup.
umbra_clean_obsolete_cert_workdirs() {
  local data_dir="$1"
  local removed

  if [[ ! -d "$data_dir" ]]; then
    return 0
  fi

  removed="$(docker run --rm \
    -v "$data_dir:/data" \
    alpine sh -c '
      set -eu
      for dir in /data/letsencrypt.new.* /data/letsencrypt.failed.*; do
        if [ -d "$dir" ]; then
          rm -rf "$dir"
          echo "$dir"
        fi
      done
    ' 2>/dev/null || true)"

  if [[ -n "$removed" ]]; then
    while IFS= read -r path; do
      [[ -n "$path" ]] && log_warn "Removed obsolete cert workdir: ${path#/data/}"
    done <<< "$removed"
  fi
}

umbra_list_empty_renewal_configs() {
  local cert_dir="$1"

  if [[ ! -d "$cert_dir" ]]; then
    return 0
  fi

  docker run --rm \
    -v "$cert_dir:/certs:ro" \
    alpine sh -c '
      set -eu
      if [ -d /certs/renewal ]; then
        find /certs/renewal -type f -name "*.conf" -size 0 -print
      fi
    ' 2>/dev/null || true
}

# Failed/interrupted Certbot runs can leave 0-byte renewal configs. They are
# not certificates, and keeping them makes status/renewal misleading.
umbra_clean_empty_renewal_configs() {
  local cert_dir="$1"
  local removed

  if [[ ! -d "$cert_dir" ]]; then
    return 0
  fi

  removed="$(docker run --rm \
    -v "$cert_dir:/certs" \
    alpine sh -c '
      set -eu
      if [ -d /certs/renewal ]; then
        find /certs/renewal -type f -name "*.conf" -size 0 -print -delete
      fi
    ' 2>/dev/null || true)"

  if [[ -n "$removed" ]]; then
    while IFS= read -r path; do
      [[ -n "$path" ]] && log_warn "Removed empty renewal config: ${path#/certs/}"
    done <<< "$removed"
  fi
}

# Clean the exact domain's 0-byte renewal config after a failed certonly run.
# This intentionally does not remove non-empty renewal configs.
umbra_clean_empty_domain_renewal_config() {
  local cert_dir="$1"
  local domain="$2"
  local removed

  umbra_validate_cert_domain "$domain" || return 1

  if [[ ! -d "$cert_dir" ]]; then
    return 0
  fi

  removed="$(docker run --rm \
    -v "$cert_dir:/certs" \
    -e DOMAIN="$domain" \
    alpine sh -c '
      set -eu
      f="/certs/renewal/$DOMAIN.conf"
      if [ -f "$f" ] && [ ! -s "$f" ]; then
        rm -f "$f"
        echo "$f"
      fi
    ' 2>/dev/null || true)"

  if [[ -n "$removed" ]]; then
    log_warn "Removed empty renewal config after failed issuance: ${removed#/certs/}"
  fi
}

# Marzban opens its TLS certificate on startup, so sync the selected edge cert
# into its private TLS directory after issuance or renewal.
umbra_sync_marzban_tls() {
  local cert_dir="$1"
  local domain="$2"
  local tls_dir="$3"

  umbra_validate_cert_domain "$domain" || return 1

  if [[ ! -d "$cert_dir" ]]; then
    log_error "Certificate directory does not exist: $cert_dir"
    return 1
  fi

  mkdir -p "$tls_dir"

  if docker run --rm \
    -v "$cert_dir:/certs:ro" \
    -v "$tls_dir:/tls" \
    -e EDGE_DOMAIN="$domain" \
    alpine sh -c '
      set -eu
      cert="/certs/live/$EDGE_DOMAIN/fullchain.pem"
      key="/certs/live/$EDGE_DOMAIN/privkey.pem"

      if [ ! -f "$cert" ] || [ ! -f "$key" ]; then
        echo "Missing certificate or private key for $EDGE_DOMAIN" >&2
        echo "Expected: $cert" >&2
        echo "Expected: $key" >&2
        exit 1
      fi

      cp "$cert" /tls/cert.pem
      cp "$key" /tls/key.pem
      chmod 644 /tls/cert.pem
      chmod 600 /tls/key.pem
    '; then
    log_ok "Marzban TLS synced from $domain certificate"
  else
    log_error "Cannot sync Marzban TLS from $cert_dir/live/$domain"
    return 1
  fi
}
