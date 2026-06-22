#!/usr/bin/env python3
"""Static checks for high-risk deployment script contracts.

This is not a shell parser. It verifies concrete safety guardrails that have
caused incidents before and are documented in docs/deployment/checklists.md.
"""
from __future__ import annotations

import sys
import re
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[2]
RELEASE_WORKFLOW = ".github/workflows/release.yml"
EXPECTED_RUYIN_IMAGES = {
    "ruyin-account-api",
    "ruyin-admin",
    "ruyin-console",
    "ruyin-nginx",
    "ruyin-subproxy",
    "ruyin-website",
}
EXPECTED_COMPOSE_IMAGES = {
    "${IMAGE_REGISTRY}/${IMAGE_NAMESPACE}/ruyin-account-api:${IMAGE_TAG:-latest}",
    "${IMAGE_REGISTRY}/${IMAGE_NAMESPACE}/ruyin-admin:${IMAGE_TAG:-latest}",
    "${IMAGE_REGISTRY}/${IMAGE_NAMESPACE}/ruyin-console:${IMAGE_TAG:-latest}",
    "${IMAGE_REGISTRY}/${IMAGE_NAMESPACE}/ruyin-nginx:${IMAGE_TAG:-latest}",
    "${IMAGE_REGISTRY}/${IMAGE_NAMESPACE}/ruyin-subproxy:${IMAGE_TAG:-latest}",
    "${IMAGE_REGISTRY}/${IMAGE_NAMESPACE}/ruyin-website:${IMAGE_TAG:-latest}",
}
EXPECTED_COMPOSE_SERVICE_IMAGES = {
    "umbra-account": "${IMAGE_REGISTRY}/${IMAGE_NAMESPACE}/ruyin-account-api:${IMAGE_TAG:-latest}",
    "umbra-account-web": "${IMAGE_REGISTRY}/${IMAGE_NAMESPACE}/ruyin-console:${IMAGE_TAG:-latest}",
    "umbra-admin": "${IMAGE_REGISTRY}/${IMAGE_NAMESPACE}/ruyin-admin:${IMAGE_TAG:-latest}",
    "umbra-nginx": "${IMAGE_REGISTRY}/${IMAGE_NAMESPACE}/ruyin-nginx:${IMAGE_TAG:-latest}",
    "umbra-subproxy": "${IMAGE_REGISTRY}/${IMAGE_NAMESPACE}/ruyin-subproxy:${IMAGE_TAG:-latest}",
    "umbra-website": "${IMAGE_REGISTRY}/${IMAGE_NAMESPACE}/ruyin-website:${IMAGE_TAG:-latest}",
}
ROOT_OWNED_DEPLOY_DEPENDENCIES = (
    Path("docker-compose.yml"),
    Path("configs/nginx"),
    Path("configs/marzban"),
    Path("services/subproxy"),
    Path("services/account"),
)
FORBIDDEN_DEPLOY_PACKAGE_COPIES = (
    Path("deploy/docker-compose.yml"),
    Path("deploy/configs"),
    Path("deploy/services"),
)
DEPLOY_STEPS_WITH_HELP = (
    Path("deploy/scripts/11-check-runtime-environment.sh"),
    Path("deploy/scripts/12-prepare-runtime-directories.sh"),
    Path("deploy/scripts/13-generate-runtime-secrets.sh"),
    Path("deploy/scripts/20-issue-tls-certificates.sh"),
    Path("deploy/scripts/21-issue-self-signed-certificates.sh"),
    Path("deploy/scripts/23-start-docker-services.sh"),
    Path("deploy/scripts/24-verify-deployment.sh"),
    Path("deploy/scripts/55-backup-runtime-state.sh"),
)

# The repository can contain local runtime files on a server checkout
# (.env.bak.*, generated data, certificate state, caches). Contract checks must
# scan source inputs only; otherwise a harmless server backup can fail release
# checks or leak old deployment details into diagnostics.
SOURCE_SCAN_PATHS: tuple[Path, ...] = (
    Path(".editorconfig"),
    Path(".env.example"),
    Path(".gitattributes"),
    Path("README.md"),
    Path("docker-compose.yml"),
    Path(".github"),
    Path("configs"),
    Path("portals"),
    Path("docs"),
    Path("services"),
    Path("scripts"),
    Path("deploy"),
)
SKIP_DIR_NAMES = {
    ".git",
    ".next",
    "__pycache__",
    ".pytest_cache",
    ".venv",
    "venv",
    "node_modules",
    "data",
    "backup",
    "private",
    "runtime",
    "generated",
}
SKIP_SUFFIXES = {
    ".pyc",
    ".pyo",
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".ico",
    ".pem",
    ".key",
    ".crt",
    ".csr",
    ".p12",
    ".pfx",
    ".log",
}
SKIP_NAME_SUFFIXES = (".bak", ".backup", ".old", ".tmp", ".swp", ".swo")
LOCALIZED_CONTENT_PREFIXES = (
    Path("portals/website/app"),
    Path("portals/website/components"),
    Path("portals/website/lib"),
    Path("portals/website/public"),
    Path("portals/console/public"),
    # console signed-in surface carries zh/en copy (personal info, labels);
    # console/lib stays ASCII-scanned (non-content code).
    Path("portals/console/app"),
    # admin signed-in surface carries zh/en copy (nav, title, stats, cards);
    # admin/lib stays ASCII-scanned (non-content code).
    Path("portals/admin/app"),
)


CHECKS: list[tuple[str, Path, list[str]]] = [
    (
        "editorconfig enforces utf-8 and lf",
        Path(".editorconfig"),
        [
            "charset = utf-8",
            "end_of_line = lf",
        ],
    ),
    (
        "deploy config checks rendered certificate paths before nginx reload",
        Path("deploy/deploy.sh"),
        [
            "check_rendered_nginx_cert_paths",
            "Missing certificate file required by rendered nginx config",
            "bash deploy/ops.sh certs --upgrade",
        ],
    ),
    (
        "config renderer prunes retired vhosts",
        Path("deploy/scripts/22-render-runtime-configs.py"),
        [
            "rendered_vhosts",
            "stale vhost",
            "stale.unlink()",
        ],
    ),
    (
        "deploy check validates environment formats",
        Path("deploy/scripts/11-check-runtime-environment.sh"),
        [
            '${1:-}',
            "Checking environment value formats",
            "CONSOLE_DOMAIN ADMIN_DOMAIN PASS_DOMAIN",
            "REALITY_SHORT_ID_LENGTH must be a positive even integer",
            "MARZBAN_SSL_CA_TYPE must be public or private",
            "SUBSCRIPTION_URL_PREFIX must be https://${SUB_DOMAIN}",
            "ADMIN_DOMAIN",
            "OIDC_ISSUER must be an http(s) URL",
            "OIDC_REDIRECT_URI must be an http(s) URL ending in /auth/callback",
            "OIDC_CLIENT_SECRET must be provisioned (>= 16 characters)",
            "REDIS_URL must be a redis:// URL",
            "require_bool CERTBOT_SKIP",
            "must be true or false",
            "REALITY_DEST must be host:port with port in range 1-65535",
            "ACCOUNT_SESSION_SECRET must be at least 32 characters",
            "ACCOUNT_INVITE_SECRET must be at least 32 characters",
            "ACCOUNT_ADMIN_PASSWORD must be at least 12 characters",
            "require_int_range ACCOUNT_INVITE_TTL_DAYS 1 3650",
        ],
    ),
    (
        "deploy config prints nginx -t output",
        Path("deploy/deploy.sh"),
        [
            'nginx_test_output="$(docker exec "$NGINX_CONTAINER" nginx -t 2>&1)"',
            'printf \'%s\\n\' "$nginx_test_output"',
        ],
    ),
    (
        "ops reload prints nginx -t output",
        Path("deploy/ops.sh"),
        [
            'nginx_test_output="$(docker exec "$NGINX_CONTAINER" nginx -t 2>&1)"',
            'Nginx config test failed; nginx was not reloaded',
        ],
    ),
    (
        "renewal does not swallow nginx -t output",
        Path("deploy/scripts/53-manage-certificates.sh"),
        [
            'nginx_test_output="$(docker exec "$NGINX_CONTAINER" nginx -t 2>&1)"',
            "Nginx config test failed after renewal",
        ],
    ),
    (
        "renewal checks active cert names only",
        Path("deploy/scripts/53-manage-certificates.sh"),
        [
            'for domain in "${DOMAINS[@]}"; do',
            '--cert-name "$domain"',
            "Running certbot renew for active domains",
        ],
    ),
    (
        "retired certificate cleanup preserves active domains",
        Path("deploy/scripts/53-manage-certificates.sh"),
        [
            "--clean-retired-lineages",
            "clean_retired_cert_lineages",
            "Only non-active entries under live/, archive/, and renewal/*.conf are removed.",
            "Certificate backups and workdirs are preserved.",
        ],
    ),
    (
        "certificate upgrade uses staged activation and rollback",
        Path("deploy/scripts/53-manage-certificates.sh"),
        [
            'STAGED_NAME="letsencrypt.staged"',
            "prepare_staged_certs",
            "verify_cert_dir_trusted",
            "activate_staged_certs",
            "restore_backup_certs",
            "Partial staged certs",
        ],
    ),
    (
        "full reset validates destructive targets",
        Path("deploy/scripts/60-reset-runtime-services.sh"),
        [
            "resolve_reset_target",
            "Refusing reset target outside ROOT_DIR",
            'rm -rf -- "$resolved_target"',
        ],
    ),
    (
        "port freeing does not kill foreign processes by default",
        Path("deploy/scripts/60-reset-runtime-services.sh"),
        [
            'FORCE_FREE_PORTS:-false',
            "not killing automatically",
        ],
    ),
    (
        "backup creates backup dir and prunes with null-safe find",
        Path("deploy/scripts/55-backup-runtime-state.sh"),
        [
            'mkdir -p "$BACKUP_DIR"',
            'cp "$ROOT_DIR/etc/.env" "$ENV_BACKUP"',
            'tar -czf "$ARCHIVE" -C "$DATA_DIR"',
            'find "$BACKUP_DIR" -type f',
            "-print0",
            "read -r -d ''",
        ],
    ),
    (
        "backup archives root-owned certificate state",
        Path("deploy/scripts/55-backup-runtime-state.sh"),
        [
            "Backing up Let's Encrypt state",
            '$LE_DIR:/data/letsencrypt:ro',
            "private_keys=$key_count",
        ],
    ),
    (
        "backup archives account portal data",
        Path("deploy/scripts/55-backup-runtime-state.sh"),
        [
            "Backing up account portal data",
            "account-data-${TIMESTAMP}.tar.gz",
            "$ACCOUNT_DATA:/data/account:ro",
        ],
    ),
    (
        "deploy all rejects root",
        Path("deploy/scripts/30-run-full-deployment.sh"),
        [
            'if [[ "$EUID" -eq 0 ]]',
            "Do not run as root",
        ],
    ),
    (
        "standalone deployment steps tolerate no help argument",
        Path("deploy/scripts/12-prepare-runtime-directories.sh"),
        [
            '${1:-}',
        ],
    ),
    (
        "reality key step tolerates no help argument",
        Path("deploy/scripts/13-generate-runtime-secrets.sh"),
        [
            '${1:-}',
        ],
    ),
    (
        "certificate issue step tolerates no help argument",
        Path("deploy/scripts/20-issue-tls-certificates.sh"),
        [
            '${1:-}',
        ],
    ),
    (
        "self-signed certificate step tolerates no help argument",
        Path("deploy/scripts/21-issue-self-signed-certificates.sh"),
        [
            '${1:-}',
        ],
    ),
    (
        "docker start step tolerates no help argument",
        Path("deploy/scripts/23-start-docker-services.sh"),
        [
            '${1:-}',
        ],
    ),
    (
        "verify step tolerates no help argument",
        Path("deploy/scripts/24-verify-deployment.sh"),
        [
            '${1:-}',
        ],
    ),
    (
        "backup operation tolerates no help argument",
        Path("deploy/scripts/55-backup-runtime-state.sh"),
        [
            '${1:-}',
        ],
    ),
    (
        "deploy all installs cron before final verification",
        Path("deploy/scripts/30-run-full-deployment.sh"),
        [
            "Configuring cron jobs",
            'CRON_LINE="17 3 * * * $REPO_DIR/ops.sh certs --renew',
            'BACKUP_CRON_LINE="0 2 * * * $REPO_DIR/ops.sh backup',
            'run_step_warn "24-verify-deployment.sh"',
        ],
    ),
    (
        "deploy verify checks cron installation",
        Path("deploy/scripts/24-verify-deployment.sh"),
        [
            "Certificate renewal cron installed",
            "Backup cron installed",
            "Certificate renewal cron missing",
            "Backup cron missing",
        ],
    ),
    (
        "deploy verify checks account portal",
        Path("deploy/scripts/24-verify-deployment.sh"),
        [
            "umbra-account",
            "umbra-account-web",
            "check_http_body_contains",
            "VXTURE STUDIO",
            "Ruyin Account",
            "$CONSOLE_DOMAIN account home",
            "$CONSOLE_DOMAIN account login",
            "$CONSOLE_DOMAIN account registration",
            "$CONSOLE_DOMAIN OIDC login redirects to authorize",
            "OIDC_ISSUER",
            "$ADMIN_DOMAIN admin app home",
            "$DATA_DIR/account/account.db",
        ],
    ),
    (
        "deploy verify checks every active certificate domain",
        Path("deploy/scripts/24-verify-deployment.sh"),
        [
            'for domain in "$APEX_DOMAIN" "$WWW_DOMAIN" "$EDGE_DOMAIN" "$SUB_DOMAIN" "$CONSOLE_DOMAIN" "$ADMIN_DOMAIN" "$PASS_DOMAIN"; do',
            "cert valid until",
        ],
    ),
    (
        "wizard rejects root",
        Path("deploy/scripts/25-run-post-deploy-wizard.sh"),
        [
            'if [[ "$EUID" -eq 0 ]]',
            "Do not run as root",
        ],
    ),
    (
        "full reset requires explicit YES",
        Path("deploy/scripts/60-reset-runtime-services.sh"),
        [
            "Type YES to confirm full reset",
            '[[ "$confirm" != "YES" ]]',
        ],
    ),
    (
        "soft reset includes account portal container",
        Path("deploy/scripts/60-reset-runtime-services.sh"),
        [
            "umbra-account",
        ],
    ),
    (
        "native subscription domain defaults to sub.ruyin.ai",
        Path(".env.example"),
        [
            "SUB_DOMAIN=sub.ruyin.ai",
            "SUBSCRIPTION_URL_PREFIX=https://sub.ruyin.ai",
        ],
    ),
    (
        "certificate scripts use collected active domains",
        Path("deploy/scripts/20-issue-tls-certificates.sh"),
        [
            "umbra_collect_cert_domains",
        ],
    ),
    (
        "cert helper collects active domains",
        Path("deploy/lib/02-certs.sh"),
        [
            "umbra_collect_active_cert_domains",
            "umbra_collect_cert_domains",
        ],
    ),
    (
        "deploy env loader resolves repository root from deploy package",
        Path("deploy/lib/01-env.sh"),
        [
            'DEPLOY_DIR="$(cd "$_UMBRA_LIB_DIR/.." && pwd)"',
            'PROJECT_ROOT="$(cd "$_UMBRA_LIB_DIR/../.." && pwd)"',
            'source "$PROJECT_ROOT/etc/.env"',
            'source "$DEPLOY_DIR/.env"',
        ],
    ),
    (
        "deploy python scripts resolve repository root from deploy package",
        Path("deploy/scripts/22-render-runtime-configs.py"),
        [
            "PROJECT_ROOT = Path(__file__).resolve().parents[2]",
        ],
    ),
    (
        "deploy clash validator resolves repository root from deploy package",
        Path("deploy/scripts/19-check-clash-rules.py"),
        [
            "PROJECT_ROOT = Path(__file__).resolve().parents[1]",
        ],
    ),
    (
        "ops certs use collected domains",
        Path("deploy/scripts/53-manage-certificates.sh"),
        [
            "umbra_collect_cert_domains",
        ],
    ),
    (
        "subscription nginx vhost is variable-driven",
        Path("configs/nginx/vhosts/04-sub.conf.template"),
        [
            "server_name {{ SUB_DOMAIN }}",
            "/etc/letsencrypt/live/{{ SUB_DOMAIN }}/fullchain.pem",
            "/etc/letsencrypt/live/{{ SUB_DOMAIN }}/privkey.pem",
        ],
    ),
    (
        "subscription vhost uses metadata normalizer",
        Path("configs/nginx/vhosts/04-sub.conf.template"),
        [
            "resolver 127.0.0.11 valid=30s ipv6=off",
            'set $subproxy_upstream "umbra-subproxy:8080"',
            "proxy_pass http://$subproxy_upstream",
            'location ~ "^/sub/([^/\\s]+)$"',
        ],
    ),
    (
        "subproxy normalizes client-visible subscription name",
        Path("services/subproxy/subproxy.py"),
        [
            "SUB_PROFILE_PREFIX",
            "fetch_username",
            "attachment; filename={safe_filename(title)}",
            "profile-title",
            "profile-web-page-url",
        ],
    ),
    (
        "compose includes subscription metadata normalizer",
        Path("docker-compose.yml"),
        [
            "umbra-subproxy:",
            "ruyin-subproxy",
            "SUB_PROFILE_PREFIX",
        ],
    ),
    (
        "compose includes invite-bound account portal",
        Path("docker-compose.yml"),
        [
            "umbra-account:",
            "ruyin-account-api",
            "umbra-account-web:",
            "ruyin-console",
            "ACCOUNT_SESSION_SECRET",
            "ACCOUNT_INVITE_SECRET",
            "ACCOUNT_ADMIN_USERNAME",
            "MARZBAN_ADMIN_USER",
            "MARZBAN_ADMIN_PASSWORD",
            "OIDC_ISSUER",
            "OIDC_CLIENT_SECRET",
            "OIDC_REDIRECT_URI",
            "REDIS_URL",
            "PUBLIC_ACCOUNT_URL",
            "${DATA_DIR}/account:/var/lib/umbra-account",
        ],
    ),
    (
        "compose includes six Umbra-owned ACR image repositories",
        Path("docker-compose.yml"),
        [
            "${IMAGE_REGISTRY}/${IMAGE_NAMESPACE}/ruyin-nginx:${IMAGE_TAG:-latest}",
            "${IMAGE_REGISTRY}/${IMAGE_NAMESPACE}/ruyin-subproxy:${IMAGE_TAG:-latest}",
            "${IMAGE_REGISTRY}/${IMAGE_NAMESPACE}/ruyin-account-api:${IMAGE_TAG:-latest}",
            "${IMAGE_REGISTRY}/${IMAGE_NAMESPACE}/ruyin-console:${IMAGE_TAG:-latest}",
            "${IMAGE_REGISTRY}/${IMAGE_NAMESPACE}/ruyin-website:${IMAGE_TAG:-latest}",
            "${IMAGE_REGISTRY}/${IMAGE_NAMESPACE}/ruyin-admin:${IMAGE_TAG:-latest}",
            "umbra-admin:",
            'PORT: "3230"',
        ],
    ),
    (
        "runtime Dockerfiles support local base image overrides",
        Path("docker/ruyin-nginx.Dockerfile"),
        [
            "ARG NGINX_BASE_IMAGE=nginx:alpine",
            "FROM ${NGINX_BASE_IMAGE}",
        ],
    ),
    (
        "account api Dockerfile supports local base image override",
        Path("docker/ruyin-account-api.Dockerfile"),
        [
            "ARG PYTHON_BASE_IMAGE=python:3.12-alpine",
            "FROM ${PYTHON_BASE_IMAGE}",
        ],
    ),
    (
        "subproxy Dockerfile supports local base image override",
        Path("docker/ruyin-subproxy.Dockerfile"),
        [
            "ARG PYTHON_BASE_IMAGE=python:3.12-alpine",
            "FROM ${PYTHON_BASE_IMAGE}",
        ],
    ),
    (
        "console docker build can access private Vxture packages",
        Path("portals/console/Dockerfile"),
        [
            "ARG NODE_BASE_IMAGE=node:22-alpine",
            "ARG VXTURE_NPM_REGISTRY",
            "--mount=type=secret,id=npm_token",
            "@vxture:registry=%s",
            "_authToken=",
            "npm ci",
            "rm -f .npmrc",
        ],
    ),
    (
        "console docker build excludes local build artifacts",
        Path("portals/console/.dockerignore"),
        [
            "node_modules",
            ".next",
            "*.tsbuildinfo",
        ],
    ),
    (
        "website docker build can access private Vxture packages",
        Path("portals/website/Dockerfile"),
        [
            "ARG NODE_BASE_IMAGE=node:22-alpine",
            "ARG VXTURE_NPM_REGISTRY",
            "--mount=type=secret,id=npm_token",
            "@vxture:registry=%s",
            "_authToken=",
            "npm ci",
            "rm -f .npmrc",
        ],
    ),
    (
        "admin docker build excludes local build artifacts",
        Path("portals/admin/.dockerignore"),
        [
            "node_modules",
            ".next",
            "*.tsbuildinfo",
        ],
    ),
    (
        "github actions design documents controlled promotion",
        Path("docs/operations/github-actions.md"),
        [
            "GitHub Actions CI/CD Design",
            "Production meaning:",
            "main updated == release approved for production",
            "develop CI success must not automatically push main.",
            "Promotion must be a controlled entry point",
            ".github/workflows/ci.yml",
            ".github/workflows/promote.yml",
            RELEASE_WORKFLOW,
            "docker-build",
            "ruyin-website",
            "ruyin-console",
            "ruyin-admin",
            "umbra-admin",
            "ruyin-nginx",
            "ruyin-account-api",
            "ruyin-subproxy",
            "ALIYUN_ACR_REGISTRY",
            "ALIYUN_ACR_NAMESPACE",
            "Required validations before push:",
            "release_confirmed",
            "expected_sha",
            "git merge --ff-only origin/develop",
            "develop CI success must not automatically push main.",
            "deploy` job runs inside `release.yml` after the `build` job",
            "No automatic develop-to-main promotion without release confirmation.",
        ],
    ),
    (
        "github actions documents first-time enablement",
        Path("docs/operations/github-actions.md"),
        [
            "Enablement (first-time activation)",
            "Operator local env file",
            "Production runtime prerequisites",
            "First enablement sequence",
            "Required Secrets",
            "Repository Rulesets",
            "NODE_AUTH_TOKEN",
            "ALIYUN_ACR_REGISTRY",
            "ALIYUN_ACR_NAMESPACE",
            "ALIYUN_ACR_USERNAME",
            "ALIYUN_ACR_PASSWORD",
            "PROMOTION_TOKEN",
            "GitHub does not trigger downstream",
            "DEPLOY_HOST",
            "DEPLOY_USER",
            "DEPLOY_SSH_KEY",
            "IMAGE_NAMESPACE=vxture",
            "sha-<short-sha>",
        ],
    ),
    (
        "github secret sync script writes repo and deploy secrets",
        Path("scripts/github/00-set-github-secrets.ps1"),
        [
            'param(',
            '$Repo = "vxture/umbra"',
            '$EnvFile = "private/github-actions.local.env"',
            '$EnvironmentName = "production"',
            "Read-LocalEnvFile",
            "Ensure-GitHubEnvironment",
            'gh api --method PUT "repos/$Repo/environments/$EnvironmentName"',
            "Set-RepoSecret",
            "Set-EnvironmentSecret",
            '"PROMOTION_TOKEN"',
            "DEPLOY_SSH_KEY_FILE",
            "DEPLOY_KNOWN_HOSTS_FILE",
            "NODE_AUTH_TOKEN",
            "ALIYUN_ACR_REGISTRY",
            "ALIYUN_ACR_NAMESPACE",
            "ALIYUN_ACR_USERNAME",
            "ALIYUN_ACR_PASSWORD",
        ],
    ),
    (
        "docker build workflow publishes six images to GHCR and Aliyun ACR",
        Path(RELEASE_WORKFLOW),
        [
            "name: docker-build",
            "push:",
            "- main",
            "${{ github.sha }}",
            "ghcr.io/${{ env.GHCR_NAMESPACE }}/${{ matrix.image }}:latest",
            "${{ env.ACR_REGISTRY }}/${{ env.ACR_NAMESPACE }}/${{ matrix.image }}:latest",
            "ruyin-website",
            "ruyin-console",
            "ruyin-admin",
            "ruyin-nginx",
            "ruyin-account-api",
            "ruyin-subproxy",
            "brand_context=./brand",
            "npm_token=${{ secrets.NODE_AUTH_TOKEN }}",
            "ALIYUN_ACR_REGISTRY",
            "ALIYUN_ACR_NAMESPACE",
            "ALIYUN_ACR_USERNAME",
            "ALIYUN_ACR_PASSWORD",
        ],
    ),
    (
        "docker build only rebuilds changed images and retags the rest by digest",
        Path(RELEASE_WORKFLOW),
        [
            "build_images:",
            "Decide build vs retag",
            "steps.decide.outputs.build == 'true'",
            "steps.decide.outputs.build == 'false'",
            "docker buildx imagetools create",
            "${repo}:${IMAGE_TAG}",
        ],
    ),
    (
        "production deploy consumes build output with GHCR primary and ACR fallback",
        Path(RELEASE_WORKFLOW),
        [
            "name: deploy",
            "needs: [detect, build]",
            "PASSED_SHA: ${{ github.sha }}",
            'image_tag="sha-$short_sha"',
            "ALIYUN_ACR_REGISTRY",
            "ALIYUN_ACR_NAMESPACE",
            "docker_login_with_retry",
            "timeout 45 docker login",
            "curl -fsSI \"https://${ALIYUN_ACR_REGISTRY}/v2/\"",
            "docker login \"$ALIYUN_ACR_REGISTRY\"",
            "packages: read",
            "GHCR_TOKEN",
            "export IMAGE_REGISTRY=\"$GHCR_REGISTRY\"",
            "export IMAGE_NAMESPACE=\"$GHCR_NAMESPACE\"",
            "export IMAGE_TAG=\"$IMAGE_TAG\"",
            "export FALLBACK_IMAGE_REGISTRY=\"$ALIYUN_ACR_REGISTRY\"",
            "export FALLBACK_IMAGE_NAMESPACE=\"$ALIYUN_ACR_NAMESPACE\"",
            "bash deploy.sh all",
            "bash deploy.sh verify",
        ],
    ),
    (
        "compose exposes only public nginx ports",
        Path("docker-compose.yml"),
        [
            '- "80:80"',
            '- "443:443"',
            'PORT: "3210"',
            'PORT: "3220"',
            'ACCOUNT_PORT: "3281"',
        ],
    ),
    (
        "deploy start pulls images and checks managed containers",
        Path("deploy/scripts/23-start-docker-services.sh"),
        [
            "compose_pull_with_retry",
            "pull_images_for_current_registry",
            "docker compose config --images",
            "docker pull --quiet",
            "docker pull failed after retries",
            "FALLBACK_IMAGE_REGISTRY",
            "FALLBACK_IMAGE_NAMESPACE",
            "Primary image registry failed",
            "docker compose up -d",
            "umbra-subproxy",
            "umbra-account",
            "umbra-admin",
        ],
    ),
    (
        "deploy start pins image digests and removes orphans for minimal recreate",
        Path("deploy/scripts/23-start-docker-services.sh"),
        [
            "26-pin-image-digests.py",
            "docker-compose.digests.yml",
            "up -d --remove-orphans",
            "falling back to tag-based startup",
        ],
    ),
    (
        "digest pinner resolves owned and external image digests",
        Path("deploy/scripts/26-pin-image-digests.py"),
        [
            "_service_images",
            "_running_repo_digest",
            "RepoDigests",
            "IMAGE_REGISTRY",
            "ruyin-",
        ],
    ),
    (
        "image registry variables are documented in env example",
        Path(".env.example"),
        [
            "IMAGE_REGISTRY=ghcr.io",
            "IMAGE_NAMESPACE=vxture",
            "IMAGE_TAG=latest",
        ],
    ),
    (
        "vpn vhost is a certless tombstone (valid cert, 444, no web surface)",
        Path("configs/nginx/vhosts/03-vpn.conf.template"),
        [
            "server_name {{ EDGE_DOMAIN }}",
            "ssl_certificate     /etc/letsencrypt/live/{{ EDGE_DOMAIN }}/fullchain.pem",
            "return 444",
        ],
    ),
    (
        "console vhost serves user self-service",
        Path("configs/nginx/vhosts/05-console.conf.template"),
        [
            "resolver 127.0.0.11 valid=30s ipv6=off",
            'set $account_upstream "umbra-account:3281"',
            'set $account_web_upstream "umbra-account-web:3220"',
            "proxy_pass http://$account_upstream",
            "proxy_pass http://$account_web_upstream",
        ],
    ),
    (
        "admin vhost serves the admin app at root and proxies account API + Marzban",
        Path("configs/nginx/vhosts/07-admin.conf.template"),
        [
            "server_name {{ ADMIN_DOMAIN }}",
            "resolver 127.0.0.11 valid=30s ipv6=off",
            'set $account_upstream "umbra-account:3281"',
            'set $admin_web_upstream "umbra-admin:3230"',
            'set $marzban_upstream "umbra-marzban:8000"',
            "location = /",
            "location ^~ /_next/",
            "location ^~ /api/account/",
            "proxy_pass http://$admin_web_upstream",
            "proxy_pass http://$account_upstream",
            "proxy_pass https://$marzban_upstream",
        ],
    ),
    (
        "account web implements the OIDC RP callback",
        Path("portals/console/app/auth/callback/route.ts"),
        [
            "getOidcConfig",
            "takeAuthRequest",
            "exchangeCode",
            "verifyToken",
            "expectedNonce: authReq.nonce",
            "createSession",
            "setSessionCookie",
        ],
    ),
    (
        "account web implements the OIDC RP login entry",
        Path("portals/console/app/auth/login/route.ts"),
        [
            "getOidcConfig",
            "createCodeVerifier",
            "challengeFromVerifier",
            "buildAuthorizeUrl",
            "putAuthRequest",
            "safeReturnTo",
        ],
    ),
    (
        "account web implements OIDC back-channel logout",
        Path("portals/console/app/auth/backchannel-logout/route.ts"),
        [
            "logout_token",
            "backchannel-logout",
            "destroyBySid",
            "claims.sid",
        ],
    ),
    (
        "admin app invite view distributes invite links",
        Path("portals/admin/app/ui/admin-app.tsx"),
        [
            "inviteUrl",
            "Invite link",
            "Subscription URL",
            "Copy link",
            "Copy code",
        ],
    ),
    (
        "account API accepts OIDC RP session bindings",
        Path("services/account/account.py"),
        [
            "RP_SESSION_COOKIE_NAME",
            "vxture_payload_from_session",
            "rpsess:",
            "vxture_account_id",
            "def api_bind_invite",
            "def api_admin_invites",
            "def api_admin_login",
            "admin_login_required",
            "PUBLIC_ACCOUNT_URL",
            "def invite_url",
            "inviteUrl",
        ],
    ),
    (
        "account portal defines multi-app binding store",
        Path("services/account/account.py"),
        [
            "CREATE TABLE IF NOT EXISTS app_bindings",
            "idx_app_binding_account_app",
            "app_key",
            "resource_ref",
            "ADD COLUMN avatar_url",
        ],
    ),
    (
        "account portal exposes the application launcher surface",
        Path("services/account/account.py"),
        [
            "APPS:",
            "def apps_for_account",
            "def api_app_post",
            "def api_app_bind",
            "def api_app_action",
            "/api/account/apps/",
            '"apps": apps_for_account',
            "secondaryAuth",
        ],
    ),
    (
        "account portal binds invites to existing Marzban users",
        Path("services/account/account.py"),
        [
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_active_invite_username",
            "marzban_user",
            "subscription_info(invite[\"subscription_url\"])",
            "This user code is already bound.",
            "UPDATE invites",
            "code_plain = NULL",
            "CREATE TABLE IF NOT EXISTS admin_sessions",
            "session_hash",
            "display_name_key",
            "marzban_users",
            "Pending binding",
            "Generate invite",
        ],
    ),
    (
        "account portal resets subscription URL on demand",
        Path("services/account/account.py"),
        [
            "def fetch_marzban_subscription_url",
            "def reset_bound_account_subscription_url",
            "def api_reset_subscription",
            "def admin_reset_subscription",
            "MARZBAN_ADMIN_USER",
            "MARZBAN_ADMIN_PASSWORD",
            "UPDATE accounts SET subscription_url",
            "action=\"/invites/reset-subscription\"",
            "button.danger",
            "Subscription / Invite",
            "Reset URL",
        ],
    ),
    (
        "admin vhost keeps Marzban reachable via the catch-all",
        Path("configs/nginx/vhosts/07-admin.conf.template"),
        [
            'set $marzban_upstream "umbra-marzban:8000"',
            "proxy_pass https://$marzban_upstream",
        ],
    ),
    (
        "nginx redirects do not expose internal 8443 listener",
        Path("configs/nginx/nginx.conf"),
        [
            "absolute_redirect off;",
            "port_in_redirect off;",
        ],
    ),
    (
        "proxy headers describe the public HTTPS endpoint",
        Path("configs/nginx/snippets/proxy-headers.conf"),
        [
            "proxy_set_header X-Forwarded-Host  $host;",
            "proxy_set_header X-Forwarded-Port  443;",
        ],
    ),
    (
        "admin vhost rewrites Marzban redirects to public domain",
        Path("configs/nginx/vhosts/07-admin.conf.template"),
        [
            "proxy_redirect https://umbra-marzban:8000 https://{{ ADMIN_DOMAIN }};",
            "proxy_redirect http://umbra-marzban:8000 https://{{ ADMIN_DOMAIN }};",
        ],
    ),
    (
        "deploy verify checks the admin app at root and Marzban at /dashboard/",
        Path("deploy/scripts/24-verify-deployment.sh"),
        [
            "$ADMIN_DOMAIN/",
            "$ADMIN_DOMAIN admin app home",
            "$ADMIN_DOMAIN root serves the admin app",
            "root redirect exposes internal port 8443",
            "$ADMIN_DOMAIN admin API requires login",
            "$ADMIN_DOMAIN/dashboard/",
            "$ADMIN_DOMAIN Marzban dashboard reachable",
            "$ADMIN_DOMAIN Marzban API reachable",
        ],
    ),
    (
        "deploy verify checks Marzban internal API over HTTPS",
        Path("deploy/scripts/24-verify-deployment.sh"),
        [
            "ssl._create_unverified_context()",
            "https://localhost:8000/api/inbounds",
            "Marzban API reachable (internal)",
        ],
    ),
    (
        "deploy verify checks subscription display name",
        Path("deploy/scripts/24-verify-deployment.sh"),
        [
            "curl_saved_subscription",
            "for attempt in 1 2 3 4 5",
            "expected_title=\"${SUB_PROFILE_PREFIX:-Ruyin}-${latest_sub_user}\"",
            "content-disposition",
            "Subscription name normalized",
        ],
    ),
    (
        "cloudflare routes through proxy or final match",
        Path("configs/marzban/clash-subscription.j2"),
        [
            "# 2. Cloudflare account, dashboard, challenge, and edge services proxy",
            "DOMAIN-SUFFIX,cloudflare.com,PROXY",
            "DOMAIN-SUFFIX,cloudflareinsights.com,PROXY",
        ],
    ),
    (
        "deepseek direct domains bypass fake-ip",
        Path("configs/marzban/clash-subscription.j2"),
        [
            "fake-ip-filter:",
            "- deepseek.com",
            '- "*.deepseek.com"',
            "- deepseek.ai",
            '- "*.deepseek.ai"',
        ],
    ),
    (
        "deepseek is must-direct",
        Path("configs/marzban/must-direct-rules.txt"),
        [
            "DOMAIN-SUFFIX,deepseek.com",
            "DOMAIN-SUFFIX,deepseek.ai",
            "DOMAIN-SUFFIX,api.deepseek.com",
        ],
    ),
    (
        "google ecosystem routes through proxy",
        Path("configs/marzban/clash-subscription.j2"),
        [
            "# 10. Google ecosystem proxy",
            "DOMAIN-SUFFIX,google.com,PROXY",
            "DOMAIN-SUFFIX,google.co.jp,PROXY",
            "DOMAIN-SUFFIX,gmail.com,PROXY",
            "DOMAIN-SUFFIX,googlemail.com,PROXY",
            "DOMAIN-SUFFIX,googleapis.com,PROXY",
            "DOMAIN-SUFFIX,gstatic.com,PROXY",
            "DOMAIN-SUFFIX,ggpht.com,PROXY",
        ],
    ),
]


FORBIDDEN: list[tuple[str, Path, str]] = [
    (
        "renewal must not hide nginx -t stderr",
        Path("deploy/scripts/53-manage-certificates.sh"),
        'nginx -t >/dev/null 2>&1',
    ),
    (
        "retired extra certificate env variable must not reappear",
        Path("."),
        "ST" + "ANDBY_CERT" + "_DOMAINS",
    ),
    (
        "retired extra certificate helper must not reappear",
        Path("."),
        "umbra_collect_" + "st" + "andby_cert_domains",
    ),
    (
        "retired extra certificate runtime array must not reappear",
        Path("."),
        "ST" + "ANDBY_" + "DOMAINS",
    ),
    (
        "native subscription must not use subscribe portal domain",
        Path("."),
        "https://subscribe" + ".ruyin.ai/sub",
    ),
    (
        "subscribe portal domain must not be configured as SUB_DOMAIN",
        Path(".env.example"),
        "SUB_DOMAIN=subscribe" + ".ruyin.ai",
    ),
    (
        "admin vhost must not block public login",
        Path("configs/nginx/vhosts/07-admin.conf.template"),
        "deny all;",
    ),
    (
        "admin vhost must not require docker-source IP",
        Path("configs/nginx/vhosts/07-admin.conf.template"),
        "allow 172.16.0.0/12;",
    ),
    (
        "admin vhost must not rewrite redirects to raw request host",
        Path("configs/nginx/vhosts/07-admin.conf.template"),
        "proxy_redirect https://umbra-marzban:8000 https://$http_host;",
    ),
    (
        "deploy verify must not treat console 403 as expected",
        Path("deploy/scripts/24-verify-deployment.sh"),
        "403=public blocked",
    ),
    (
        "deploy verify must not call console access controlled",
        Path("deploy/scripts/24-verify-deployment.sh"),
        "$CONSOLE_DOMAIN access control",
    ),
    (
        "subproxy must not quote content-disposition filename",
        Path("services/subproxy/subproxy.py"),
        'filename="{safe_filename(title)}"',
    ),
    (
        "account portal dashboard must not open subscription URL",
        Path("services/account/account.py"),
        "Open subscription",
    ),
    (
        "account portal dashboard GET must not auto-update subscription URL",
        Path("services/account/account.py"),
        "if fresh_sub_url and fresh_sub_url != sub_url:",
    ),
    (
        "account portal must not label subscription reset as update",
        Path("services/account/account.py"),
        "Update subscription URL",
    ),
    (
        "invite console must not label subscription reset as update",
        Path("services/account/account.py"),
        "Update URL",
    ),
    (
        "account portal must not serve a local login page",
        Path("services/account/account.py"),
        "def login_page",
    ),
    (
        "account portal must not self-register local passwords",
        Path("services/account/account.py"),
        "def register_submit",
    ),
    (
        "account portal must not keep a local password session",
        Path("services/account/account.py"),
        "def user_session",
    ),
    (
        "account portal must not hash local passwords",
        Path("services/account/account.py"),
        "def password_hash",
    ),
    (
        "account portal must not keep the retired local session cookie",
        Path("services/account/account.py"),
        '"umbra_session"',
    ),
    (
        "clash subscription must not require ASN database",
        Path("."),
        "IP-" + "ASN,",
    ),
    (
        "website dev port must not be host-published",
        Path("docker-compose.yml"),
        '"3210:3210"',
    ),
    (
        "console dev port must not be host-published",
        Path("docker-compose.yml"),
        '"3220:3220"',
    ),
    (
        "account API dev port must not be host-published",
        Path("docker-compose.yml"),
        '"3281:3281"',
    ),
    (
        "cloudflare.com must not be must-direct",
        Path("configs/marzban/must-direct-rules.txt"),
        "DOMAIN-SUFFIX,cloudflare.com",
    ),
    (
        "cloudflare dns must not be must-direct",
        Path("configs/marzban/must-direct-rules.txt"),
        "DOMAIN-SUFFIX,cloudflare-dns.com",
    ),
    (
        "cloudflare access must not be must-direct",
        Path("configs/marzban/must-direct-rules.txt"),
        "DOMAIN-SUFFIX,cloudflareaccess.com",
    ),
    (
        "cloudflare apps must not be must-direct",
        Path("configs/marzban/must-direct-rules.txt"),
        "DOMAIN-SUFFIX,cloudflareapps.com",
    ),
    (
        "cloudflare client must not be must-direct",
        Path("configs/marzban/must-direct-rules.txt"),
        "DOMAIN-SUFFIX,cloudflareclient.com",
    ),
    (
        "cloudflare insights must not be must-direct",
        Path("configs/marzban/must-direct-rules.txt"),
        "DOMAIN-SUFFIX,cloudflareinsights.com",
    ),
    (
        "cloudflare status must not be must-direct",
        Path("configs/marzban/must-direct-rules.txt"),
        "DOMAIN-SUFFIX,cloudflarestatus.com",
    ),
    (
        "cloudflare stream must not be must-direct",
        Path("configs/marzban/must-direct-rules.txt"),
        "DOMAIN-SUFFIX,cloudflarestream.com",
    ),
    (
        "cloudflare storage must not be must-direct",
        Path("configs/marzban/must-direct-rules.txt"),
        "DOMAIN-SUFFIX,cloudflarestorage.com",
    ),
    (
        "cloudflare workers must not be must-direct",
        Path("configs/marzban/must-direct-rules.txt"),
        "DOMAIN-SUFFIX,cloudflareworkers.com",
    ),
    (
        "workers.dev must not be must-direct",
        Path("configs/marzban/must-direct-rules.txt"),
        "DOMAIN-SUFFIX,workers.dev",
    ),
    (
        "pages.dev must not be must-direct",
        Path("configs/marzban/must-direct-rules.txt"),
        "DOMAIN-SUFFIX,pages.dev",
    ),
    (
        "trycloudflare must not be must-direct",
        Path("configs/marzban/must-direct-rules.txt"),
        "DOMAIN-SUFFIX,trycloudflare.com",
    ),
    (
        "argotunnel must not be must-direct",
        Path("configs/marzban/must-direct-rules.txt"),
        "DOMAIN-SUFFIX,argotunnel.com",
    ),
    (
        "warp.dev must not be must-direct",
        Path("configs/marzban/must-direct-rules.txt"),
        "DOMAIN-SUFFIX,warp.dev",
    ),
    (
        "one.one.one.one must not be must-direct",
        Path("configs/marzban/must-direct-rules.txt"),
        "DOMAIN,one.one.one.one",
    ),
    (
        "google.com must not be must-direct",
        Path("configs/marzban/must-direct-rules.txt"),
        "DOMAIN-SUFFIX,google.com",
    ),
    (
        "google.co.jp must not be must-direct",
        Path("configs/marzban/must-direct-rules.txt"),
        "DOMAIN-SUFFIX,google.co.jp",
    ),
    (
        "gmail.com must not be must-direct",
        Path("configs/marzban/must-direct-rules.txt"),
        "DOMAIN-SUFFIX,gmail.com",
    ),
    (
        "release deploy must not require original push event",
        Path(RELEASE_WORKFLOW),
        "github.event.workflow_run.event == 'push'",
    ),
]


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def should_skip(path: Path) -> bool:
    rel_path = path.relative_to(PROJECT_ROOT)
    if any(rel_path == prefix or rel_path.is_relative_to(prefix) for prefix in LOCALIZED_CONTENT_PREFIXES):
        return True

    rel_parts = rel_path.parts
    if any(part in SKIP_DIR_NAMES for part in rel_parts):
        return True

    name = path.name
    if name.startswith(".env") and name != ".env.example":
        return True
    if ".bak." in name or name.endswith(SKIP_NAME_SUFFIXES):
        return True
    if path.suffix.lower() in SKIP_SUFFIXES:
        return True
    return False


def iter_text_files(root: Path):
    for path in root.rglob("*"):
        if not path.is_file():
            continue
        if should_skip(path):
            continue
        yield path


def iter_source_files():
    for rel_path in SOURCE_SCAN_PATHS:
        path = PROJECT_ROOT / rel_path
        if path.is_file():
            if not should_skip(path):
                yield path
            continue
        if path.is_dir():
            yield from iter_text_files(path)


def non_ascii_locations(text: str) -> list[tuple[int, str]]:
    locations: list[tuple[int, str]] = []
    for line_no, line in enumerate(text.splitlines(), start=1):
        if any(ord(ch) > 127 for ch in line):
            locations.append((line_no, line.strip()))
    return locations


def check_compose_owned_image_mapping() -> list[str]:
    text = read(PROJECT_ROOT / "docker-compose.yml")
    service_images: dict[str, str] = {}
    current_service: str | None = None
    for line in text.splitlines():
        service_match = re.match(r"^  (umbra-[a-z-]+):\s*$", line)
        if service_match:
            current_service = service_match.group(1)
            continue

        if re.match(r"^  [A-Za-z0-9_-]+:\s*$", line):
            current_service = None
            continue

        image_match = re.match(
            r"^    image: (\$\{IMAGE_REGISTRY\}/\$\{IMAGE_NAMESPACE\}/ruyin-[a-z-]+:\$\{IMAGE_TAG:-latest\})\s*$",
            line,
        )
        if current_service and image_match:
            service_images[current_service] = image_match.group(1)

    problems: list[str] = []
    if service_images != EXPECTED_COMPOSE_SERVICE_IMAGES:
        missing = EXPECTED_COMPOSE_SERVICE_IMAGES.items() - service_images.items()
        extra = service_images.items() - EXPECTED_COMPOSE_SERVICE_IMAGES.items()
        if missing:
            problems.append(f"missing or changed service image mapping: {sorted(missing)!r}")
        if extra:
            problems.append(f"unexpected service image mapping: {sorted(extra)!r}")

    images = set(service_images.values())
    if images != EXPECTED_COMPOSE_IMAGES:
        problems.append(
            "owned compose image set must be exactly "
            f"{sorted(EXPECTED_COMPOSE_IMAGES)!r}; got {sorted(images)!r}"
        )
    return problems


def check_docker_build_image_matrix() -> list[str]:
    text = read(PROJECT_ROOT / RELEASE_WORKFLOW)
    matrix_images = set(re.findall(r"^\s+- image: (ruyin-[a-z-]+)\s*$", text, flags=re.MULTILINE))
    problems: list[str] = []
    if matrix_images != EXPECTED_RUYIN_IMAGES:
        problems.append(
            "docker-build matrix images must be exactly "
            f"{sorted(EXPECTED_RUYIN_IMAGES)!r}; got {sorted(matrix_images)!r}"
        )

    required_tag_patterns = (
        "ghcr.io/${{ env.GHCR_NAMESPACE }}/${{ matrix.image }}:latest",
        "ghcr.io/${{ env.GHCR_NAMESPACE }}/${{ matrix.image }}:${{ steps.meta.outputs.image_tag }}",
        "${{ env.ACR_REGISTRY }}/${{ env.ACR_NAMESPACE }}/${{ matrix.image }}:latest",
        "${{ env.ACR_REGISTRY }}/${{ env.ACR_NAMESPACE }}/${{ matrix.image }}:${{ steps.meta.outputs.image_tag }}",
    )
    missing_tags = [tag for tag in required_tag_patterns if tag not in text]
    if missing_tags:
        problems.append(f"docker-build must publish GHCR and ACR latest/sha tags: missing {missing_tags!r}")
    return problems


def check_deploy_fallback_contract() -> list[str]:
    workflow = read(PROJECT_ROOT / RELEASE_WORKFLOW)
    start_script = read(PROJECT_ROOT / "deploy/scripts/23-start-docker-services.sh")
    problems: list[str] = []

    if "GHCR_TOKEN: ${{ github.token }}" in workflow and "packages: read" not in workflow:
        problems.append("deploy uses github.token for GHCR but lacks packages: read")
    if (
        "export IMAGE_REGISTRY=\"$GHCR_REGISTRY\"" not in workflow
        or "export IMAGE_NAMESPACE=\"$GHCR_NAMESPACE\"" not in workflow
    ):
        problems.append("deploy workflow must pull GHCR as production primary registry")
    if (
        "export FALLBACK_IMAGE_REGISTRY=\"$ALIYUN_ACR_REGISTRY\"" not in workflow
        or "export FALLBACK_IMAGE_NAMESPACE=\"$ALIYUN_ACR_NAMESPACE\"" not in workflow
    ):
        problems.append("deploy workflow must use Aliyun ACR as production fallback registry")
    if (
        "FALLBACK_IMAGE_REGISTRY" not in start_script
        or "FALLBACK_IMAGE_NAMESPACE" not in start_script
    ):
        problems.append("deploy workflow exports fallback registry but start script does not consume it")
    if "docker login \"$ALIYUN_ACR_REGISTRY\"" not in workflow:
        problems.append("deploy workflow must login to Aliyun ACR fallback registry explicitly")
    if "docker compose pull" in start_script:
        problems.append("deploy start must use serial docker pull via docker compose config --images")
    if 'timeout "$pull_timeout" docker pull --quiet "$image"' not in start_script:
        problems.append("deploy start must bound docker pull hangs with timeout")
    if "for attempt in 1 2 3; do" not in start_script:
        problems.append("deploy start must fail primary registry quickly enough to reach fallback")
    if "export IMAGE_REGISTRY=\"$FALLBACK_IMAGE_REGISTRY\"" in start_script:
        if "docker compose up -d" not in start_script:
            problems.append("fallback registry switch must be followed by docker compose up -d")
    required_ssh_options = (
        "-o ServerAliveInterval=30",
        "-o ServerAliveCountMax=20",
        "-o ConnectTimeout=30",
    )
    missing_ssh_options = [option for option in required_ssh_options if option not in workflow]
    if missing_ssh_options:
        problems.append(f"deploy workflow must keep long SSH sessions alive: missing {missing_ssh_options!r}")
    return problems


def check_help_argument_guards() -> list[str]:
    problems: list[str] = []
    for rel_path in DEPLOY_STEPS_WITH_HELP:
        text = read(PROJECT_ROOT / rel_path)
        first_lines = "\n".join(text.splitlines()[:20])
        if "${1:-}" not in first_lines:
            problems.append(f"{rel_path.as_posix()} must use ${{1:-}} for its entrypoint help guard")
        if re.search(r'\[\[\s*"\$1"\s*==\s*"-(?:-|h)', first_lines):
            problems.append(f"{rel_path.as_posix()} uses naked $1 in its entrypoint help guard")
    return problems


def check_deploy_dependency_boundary() -> list[str]:
    problems: list[str] = []

    missing = [path.as_posix() for path in ROOT_OWNED_DEPLOY_DEPENDENCIES if not (PROJECT_ROOT / path).exists()]
    if missing:
        problems.append(f"root-owned deploy dependencies are missing: {missing!r}")

    misplaced = [path.as_posix() for path in FORBIDDEN_DEPLOY_PACKAGE_COPIES if (PROJECT_ROOT / path).exists()]
    if misplaced:
        problems.append(
            "deploy package must not own compose/config/service copies: "
            f"{misplaced!r}"
        )

    render_script = read(PROJECT_ROOT / "deploy/scripts/22-render-runtime-configs.py")
    required_renderer_refs = (
        'REPO_DIR = Path(env.get("REPO_DIR", str(PROJECT_ROOT)))',
        'configs_dir = REPO_DIR / "configs"',
        'configs_dir / "nginx"',
        'configs_dir / "marzban"',
    )
    missing_refs = [ref for ref in required_renderer_refs if ref not in render_script]
    if missing_refs:
        problems.append(f"config renderer must read shared root configs: missing {missing_refs!r}")

    env_loader = read(PROJECT_ROOT / "deploy/lib/01-env.sh")
    if 'PROJECT_ROOT="$(cd "$_UMBRA_LIB_DIR/../.." && pwd)"' not in env_loader:
        problems.append("deploy env loader must resolve PROJECT_ROOT to the persistent root (etc/.env)")

    return problems


def check_brand_assets_use_png_and_ico() -> list[str]:
    problems: list[str] = []
    roots = (
        PROJECT_ROOT / "brand",
        PROJECT_ROOT / "portals/website/public/assets/brand",
        PROJECT_ROOT / "portals/console/public/assets/brand",
        PROJECT_ROOT / "portals/admin/public/assets/brand",
    )

    # The hero wordmark is rendered as an inline-SVG React component (themed via
    # currentColor for instant theme switching); brand/ruyin-hero.svg is its
    # source-of-record and is the one allowed SVG. All other brand assets that are
    # served as <img> / favicon / og:image must stay raster (PNG/ICO).
    svg_files: list[str] = []
    for root in roots:
        if root.exists():
            svg_files.extend(
                path.relative_to(PROJECT_ROOT).as_posix()
                for path in root.rglob("*.svg")
                if path.name != "ruyin-hero.svg"
            )
    if svg_files:
        problems.append(f"Ruyin brand assets must be PNG/ICO, not SVG: {svg_files!r}")

    # ruyin-hero-light.png is kept as the og:image / twitter:image (social cards
    # need a raster image). ruyin-hero-dark.png is retired: the on-page hero is now
    # the inline SVG, so a dark hero raster is no longer needed.
    required = (
        PROJECT_ROOT / "brand/favicon.ico",
        PROJECT_ROOT / "brand/ruyin-hero-light.png",
        PROJECT_ROOT / "brand/ruyin-symbol-dark.png",
        PROJECT_ROOT / "brand/ruyin-symbol-light.png",
    )
    missing = [path.relative_to(PROJECT_ROOT).as_posix() for path in required if not path.exists()]
    if missing:
        problems.append(f"canonical PNG/ICO brand pack is incomplete: missing {missing!r}")

    return problems


def check_env_example_is_source_safe() -> list[str]:
    # The production deploy sources .env via bash (set -a; source .env). A bare
    # multi-word value like `KEY=a b c` makes bash run `b c` as a command (exit
    # 127), aborting the deploy. docker compose --env-file does not word-split, so
    # this slips past compose validation; guard it here. Values with whitespace
    # must be quoted.
    problems: list[str] = []
    path = PROJECT_ROOT / ".env.example"
    if not path.exists():
        return ["[.env.example] not found"]
    assign = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*=(.*)$")
    for line_no, raw in enumerate(read(path).splitlines(), start=1):
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        m = assign.match(line)
        if not m:
            continue
        value = m.group(1)
        if not value:
            continue
        quoted = (value[0] == value[-1] and value[0] in ("'", '"') and len(value) >= 2)
        if not quoted and any(ch.isspace() for ch in value):
            problems.append(f".env.example:{line_no}: unquoted value with whitespace breaks `source`: {line}")
    return problems


CUSTOM_CHECKS = (
    ("env.example is bash-source-safe", check_env_example_is_source_safe),
    ("compose owned image mapping is exact", check_compose_owned_image_mapping),
    ("docker build matrix publishes the exact owned images", check_docker_build_image_matrix),
    ("deploy fallback contract is valid", check_deploy_fallback_contract),
    ("standalone scripts guard optional first argument", check_help_argument_guards),
    ("deploy dependency boundary is explicit", check_deploy_dependency_boundary),
    ("brand assets use PNG and ICO", check_brand_assets_use_png_and_ico),
)


def main() -> int:
    failed = 0

    for label, rel_path, required in CHECKS:
        path = PROJECT_ROOT / rel_path
        if not path.exists():
            print(f"[FAIL] {label}: missing file {rel_path}")
            failed += 1
            continue

        text = read(path)
        missing = [needle for needle in required if needle not in text]
        if missing:
            print(f"[FAIL] {label}: missing {missing!r}")
            failed += 1
        else:
            print(f"[ OK ] {label}")

    absent_paths = [
        Path(".github/workflows/quality-gate.yml"),
        Path(".github/workflows/promote-develop-to-main.yml"),
        Path(".github/workflows/docker-build.yml"),
        Path(".github/workflows/deploy-worker-03.yml"),
    ]
    for rel_path in absent_paths:
        if (PROJECT_ROOT / rel_path).exists():
            print(f"[FAIL] retired workflow must not reappear: {rel_path}")
            failed += 1
        else:
            print(f"[ OK ] retired workflow absent: {rel_path}")

    for label, check in CUSTOM_CHECKS:
        problems = check()
        if problems:
            print(f"[FAIL] {label}")
            for problem in problems:
                print(f"[FAIL]   {problem}")
            failed += 1
        else:
            print(f"[ OK ] {label}")

    ascii_failures: list[str] = []
    for path in iter_source_files():
        text = read(path)
        for line_no, line in non_ascii_locations(text):
            rel = path.relative_to(PROJECT_ROOT).as_posix()
            ascii_failures.append(f"{rel}:{line_no}: {line}")
    if ascii_failures:
        print("[FAIL] source maintenance files must use ASCII text")
        for item in ascii_failures[:50]:
            print(f"[FAIL]   {item}")
        if len(ascii_failures) > 50:
            print(f"[FAIL]   ... {len(ascii_failures) - 50} more")
        failed += 1
    else:
        print("[ OK ] source maintenance files use ASCII text")

    for label, rel_path, needle in FORBIDDEN:
        paths = [PROJECT_ROOT / rel_path] if rel_path != Path(".") else list(iter_source_files())
        matches = []
        for path in paths:
            if path.exists() and needle in read(path):
                matches.append(path.relative_to(PROJECT_ROOT).as_posix())
        if matches:
            print(f"[FAIL] {label}: found {needle!r} in {matches}")
            failed += 1
        else:
            print(f"[ OK ] {label}")

    if failed:
        print(f"[FAIL] script contract checks failed: {failed}")
        return 1

    print("[ OK ] script contract checks passed")
    return 0


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(
        description="Static checks for high-risk deployment script contracts.",
        epilog="Run from repo root: python3 scripts/checks/06-check-deploy-contracts.py",
    )
    parser.parse_args()
    sys.exit(main())
