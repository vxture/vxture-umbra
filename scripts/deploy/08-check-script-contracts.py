#!/usr/bin/env python3
"""Static checks for high-risk deployment script contracts.

This is not a shell parser. It verifies concrete safety guardrails that have
caused incidents before and are documented in docs/deployment/checklists.md.
"""
from __future__ import annotations

import sys
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[2]

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
    Path("configs"),
    Path("portals"),
    Path("docs"),
    Path("services"),
    Path("scripts"),
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
LOCALIZED_STATIC_PREFIXES = (
    Path("portals/website/static"),
    Path("portals/console/static"),
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
        Path("scripts/deploy.sh"),
        [
            "check_rendered_nginx_cert_paths",
            "Missing certificate file required by rendered nginx config",
            "bash scripts/ops.sh certs --upgrade",
        ],
    ),
    (
        "config renderer prunes retired vhosts",
        Path("scripts/deploy/04-render-configs.py"),
        [
            "rendered_vhosts",
            "stale vhost",
            "stale.unlink()",
        ],
    ),
    (
        "deploy check validates environment formats",
        Path("scripts/deploy/00-check-env.sh"),
        [
            "Checking environment value formats",
            "CONSOLE_DOMAIN ADMIN_DOMAIN PASS_DOMAIN",
            "REALITY_SHORT_ID_LENGTH must be a positive even integer",
            "MARZBAN_SSL_CA_TYPE must be public or private",
            "SUBSCRIPTION_URL_PREFIX must be https://${SUB_DOMAIN}",
            "ADMIN_DOMAIN",
            "JWT_SECRET must be at least 32 characters and match Vxture auth-bff",
            "AUTH_INTERNAL_TOKEN must be at least 32 characters and match Vxture auth-bff",
            "AUTH_BFF_URL must be an http(s) URL",
            "VXTURE_LOGIN_URL must be an http(s) URL",
            "VXTURE_SSO_URL must be empty or an http(s) URL",
            "require_bool CERTBOT_SKIP",
            "must be true or false",
            "REALITY_DEST must be host:port with port in range 1-65535",
            "ACCOUNT_SESSION_SECRET must be at least 32 characters",
            "ACCOUNT_INVITE_SECRET must be at least 32 characters",
            "require_int_range ACCOUNT_INVITE_TTL_DAYS 1 3650",
        ],
    ),
    (
        "deploy config prints nginx -t output",
        Path("scripts/deploy.sh"),
        [
            'nginx_test_output="$(docker exec "$NGINX_CONTAINER" nginx -t 2>&1)"',
            'printf \'%s\\n\' "$nginx_test_output"',
        ],
    ),
    (
        "ops reload prints nginx -t output",
        Path("scripts/ops.sh"),
        [
            'nginx_test_output="$(docker exec "$NGINX_CONTAINER" nginx -t 2>&1)"',
            'Nginx config test failed; nginx was not reloaded',
        ],
    ),
    (
        "renewal does not swallow nginx -t output",
        Path("scripts/ops/certs.sh"),
        [
            'nginx_test_output="$(docker exec "$NGINX_CONTAINER" nginx -t 2>&1)"',
            "Nginx config test failed after renewal",
        ],
    ),
    (
        "renewal checks active cert names only",
        Path("scripts/ops/certs.sh"),
        [
            'for domain in "${DOMAINS[@]}"; do',
            '--cert-name "$domain"',
            "Running certbot renew for active domains",
        ],
    ),
    (
        "retired certificate cleanup preserves active domains",
        Path("scripts/ops/certs.sh"),
        [
            "--clean-retired-lineages",
            "clean_retired_cert_lineages",
            "Only non-active entries under live/, archive/, and renewal/*.conf are removed.",
            "Certificate backups and workdirs are preserved.",
        ],
    ),
    (
        "certificate upgrade uses staged activation and rollback",
        Path("scripts/ops/certs.sh"),
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
        Path("scripts/server/reset.sh"),
        [
            "resolve_reset_target",
            "Refusing reset target outside ROOT_DIR",
            'rm -rf -- "$resolved_target"',
        ],
    ),
    (
        "port freeing does not kill foreign processes by default",
        Path("scripts/server/reset.sh"),
        [
            'FORCE_FREE_PORTS:-false',
            "not killing automatically",
        ],
    ),
    (
        "backup creates backup dir and prunes with null-safe find",
        Path("scripts/ops/backup.sh"),
        [
            'mkdir -p "$BACKUP_DIR"',
            'cp "$REPO_DIR/.env" "$ENV_BACKUP"',
            'tar -czf "$ARCHIVE" -C "$DATA_DIR"',
            'find "$BACKUP_DIR" -type f',
            "-print0",
            "read -r -d ''",
        ],
    ),
    (
        "backup archives root-owned certificate state",
        Path("scripts/ops/backup.sh"),
        [
            "Backing up Let's Encrypt state",
            '$LE_DIR:/data/letsencrypt:ro',
            "private_keys=$key_count",
        ],
    ),
    (
        "backup archives account portal data",
        Path("scripts/ops/backup.sh"),
        [
            "Backing up account portal data",
            "account-data-${TIMESTAMP}.tar.gz",
            "$ACCOUNT_DATA:/data/account:ro",
        ],
    ),
    (
        "deploy all rejects root",
        Path("scripts/deploy/all.sh"),
        [
            'if [[ "$EUID" -eq 0 ]]',
            "Do not run as root",
        ],
    ),
    (
        "deploy all installs cron before final verification",
        Path("scripts/deploy/all.sh"),
        [
            "Configuring cron jobs",
            'CRON_LINE="17 3 * * * $REPO_DIR/scripts/ops.sh certs --renew',
            'BACKUP_CRON_LINE="0 2 * * * $REPO_DIR/scripts/ops.sh backup',
            'run_step_warn "06-verify.sh"',
        ],
    ),
    (
        "deploy verify checks cron installation",
        Path("scripts/deploy/06-verify.sh"),
        [
            "Certificate renewal cron installed",
            "Backup cron installed",
            "Certificate renewal cron missing",
            "Backup cron missing",
        ],
    ),
    (
        "deploy verify checks account portal",
        Path("scripts/deploy/06-verify.sh"),
        [
            "umbra-account",
            "umbra-account-web",
            "check_http_body_contains",
            "$EDGE_DOMAIN VPN display",
            "Ruyin Account",
            "$CONSOLE_DOMAIN account home",
            "$CONSOLE_DOMAIN account login",
            "$CONSOLE_DOMAIN account registration",
            "$CONSOLE_DOMAIN SSO start redirects to Vxture",
            "VXTURE_SSO_URL",
            "$ADMIN_DOMAIN invite console",
            "$DATA_DIR/account/account.db",
        ],
    ),
    (
        "deploy verify checks every active certificate domain",
        Path("scripts/deploy/06-verify.sh"),
        [
            'for domain in "$APEX_DOMAIN" "$WWW_DOMAIN" "$EDGE_DOMAIN" "$SUB_DOMAIN" "$CONSOLE_DOMAIN" "$ADMIN_DOMAIN" "$PASS_DOMAIN"; do',
            "cert valid until",
        ],
    ),
    (
        "post deploy rejects root",
        Path("scripts/deploy/post.sh"),
        [
            'if [[ "$EUID" -eq 0 ]]',
            "Do not run as root",
        ],
    ),
    (
        "full reset requires explicit YES",
        Path("scripts/server/reset.sh"),
        [
            "Type YES to confirm full reset",
            '[[ "$confirm" != "YES" ]]',
        ],
    ),
    (
        "soft reset includes account portal container",
        Path("scripts/server/reset.sh"),
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
        Path("scripts/deploy/03-issue-certs.sh"),
        [
            "umbra_collect_cert_domains",
        ],
    ),
    (
        "cert helper collects active domains",
        Path("scripts/lib/certs.sh"),
        [
            "umbra_collect_active_cert_domains",
            "umbra_collect_cert_domains",
        ],
    ),
    (
        "ops certs use collected domains",
        Path("scripts/ops/certs.sh"),
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
            "SUB_PROFILE_PREFIX",
            "./services/subproxy/subproxy.py:/app/subproxy.py:ro",
        ],
    ),
    (
        "compose includes invite-bound account portal",
        Path("docker-compose.yml"),
        [
            "umbra-account:",
            "umbra-account-web:",
            "context: ./portals/console",
            "ACCOUNT_SESSION_SECRET",
            "ACCOUNT_INVITE_SECRET",
            "MARZBAN_ADMIN_USER",
            "MARZBAN_ADMIN_PASSWORD",
            "JWT_SECRET",
            "AUTH_BFF_URL",
            "AUTH_INTERNAL_TOKEN",
            "VXTURE_SSO_URL",
            "PUBLIC_ACCOUNT_URL",
            "./services/account/account.py:/app/account.py:ro",
            "${DATA_DIR}/account:/var/lib/umbra-account",
        ],
    ),
    (
        "deploy up restarts code-mounted Python services",
        Path("scripts/deploy/05-up.sh"),
        [
            "Restarting code-mounted Python services",
            "docker compose restart umbra-subproxy umbra-account",
            "umbra-subproxy",
            "umbra-account",
        ],
    ),
    (
        "vpn vhost serves edge display",
        Path("configs/nginx/vhosts/03-vpn-portal.conf.template"),
        [
            "resolver 127.0.0.11 valid=30s ipv6=off",
            "location /guide/",
            "proxy_pass http://umbra-portal:80/",
        ],
    ),
    (
        "console vhost serves user self-service",
        Path("configs/nginx/vhosts/05-console.conf.template"),
        [
            "location = /invites",
            "location ^~ /invites/",
            "https://{{ ADMIN_DOMAIN }}",
            "resolver 127.0.0.11 valid=30s ipv6=off",
            'set $account_upstream "umbra-account:8081"',
            'set $account_web_upstream "umbra-account-web:3000"',
            "proxy_pass http://$account_upstream",
            "proxy_pass http://$account_web_upstream",
        ],
    ),
    (
        "admin vhost exposes Marzban and invite console",
        Path("configs/nginx/vhosts/07-admin.conf.template"),
        [
            "server_name {{ ADMIN_DOMAIN }}",
            "location = /invites",
            "location ^~ /invites/",
            'set $account_upstream "umbra-account:8081"',
            'set $account_web_upstream "umbra-account-web:3000"',
            'set $marzban_upstream "umbra-marzban:8000"',
            "proxy_pass http://$account_upstream",
            "proxy_pass http://$account_web_upstream",
            "proxy_pass https://$marzban_upstream",
            "return 302 /dashboard/",
        ],
    ),
    (
        "account web implements Vxture SSO callback and invite UI",
        Path("portals/console/app/auth/callback/route.ts"),
        [
            "umbra_sso_state",
            "timingSafeEqual",
            "process.env.NODE_ENV === \"production\"",
            "request.nextUrl.searchParams.get(\"error\")",
            "response.cookies.delete",
            "/auth/crossdomain/verify",
            "/auth/internal/sign",
            "source: \"ruyin.ai\"",
            "source: \"ruyin\"",
            "set-cookie",
        ],
    ),
    (
        "account web implements Vxture SSO start",
        Path("portals/console/app/auth/start/route.ts"),
        [
            "VXTURE_SSO_URL",
            "umbra_sso_state",
            "process.env.NODE_ENV === \"production\"",
            "bad_config",
            "from: \"ruyin\"",
            "caller: \"Ruyin\"",
            "returnTo",
            "ctx",
        ],
    ),
    (
        "invite console distributes invite links",
        Path("portals/console/app/ui/invite-console.tsx"),
        [
            "inviteUrl",
            "Invite link",
            "Subscription / Invite link",
            "Copy link",
            "Copy code",
        ],
    ),
    (
        "account API accepts Vxture SSO bindings",
        Path("services/account/account.py"),
        [
            "VXTURE_COOKIE_ACCESS",
            "verify_vxture_jwt",
            "vxture_account_id",
            "def api_bind_invite",
            "def api_admin_invites",
            "PUBLIC_ACCOUNT_URL",
            "def invite_url",
            "inviteUrl",
            "UMBRA_INVITE_ADMIN_PERMISSION",
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
            "normalize_display_name",
            "Name is already used.",
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
            "def reset_subscription_submit",
            "def admin_reset_subscription",
            "MARZBAN_ADMIN_USER",
            "MARZBAN_ADMIN_PASSWORD",
            "UPDATE accounts SET subscription_url",
            "action=\"/dashboard/reset-subscription\"",
            "action=\"/invites/reset-subscription\"",
            "button.danger",
            "Reset subscription URL",
            "Subscription / Invite",
            "Reset URL",
            "data-copy=\"subscription-url\"",
            "Copy subscription URL",
        ],
    ),
    (
        "account portal root defaults to login",
        Path("services/account/account.py"),
        [
            'elif path == "/":',
            "self.login_page()",
            'href="/register"',
            "Register / Activate",
        ],
    ),
    (
        "admin vhost delegates auth to Marzban",
        Path("configs/nginx/vhosts/07-admin.conf.template"),
        [
            'set $marzban_upstream "umbra-marzban:8000"',
            "proxy_pass https://$marzban_upstream",
            "return 302 /dashboard/",
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
        "deploy verify treats admin as public Marzban login",
        Path("scripts/deploy/06-verify.sh"),
        [
            "$ADMIN_DOMAIN/",
            "$ADMIN_DOMAIN root redirects to dashboard",
            "root redirect exposes internal port 8443",
            "$ADMIN_DOMAIN/dashboard/",
            "$ADMIN_DOMAIN API reaches Marzban auth",
            "$ADMIN_DOMAIN login reachable",
            "$ADMIN_DOMAIN login not reachable",
        ],
    ),
    (
        "deploy verify checks Marzban internal API over HTTPS",
        Path("scripts/deploy/06-verify.sh"),
        [
            "ssl._create_unverified_context()",
            "https://localhost:8000/api/inbounds",
            "Marzban API reachable (internal)",
        ],
    ),
    (
        "deploy verify checks subscription display name",
        Path("scripts/deploy/06-verify.sh"),
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
            "# 3. Cloudflare account, dashboard, challenge, and edge services proxy",
            "DOMAIN-SUFFIX,cloudflare.com,PROXY",
            "DOMAIN-SUFFIX,cloudflareinsights.com,PROXY",
        ],
    ),
]


FORBIDDEN: list[tuple[str, Path, str]] = [
    (
        "renewal must not hide nginx -t stderr",
        Path("scripts/ops/certs.sh"),
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
        Path("scripts/deploy/06-verify.sh"),
        "403=public blocked",
    ),
    (
        "deploy verify must not call console access controlled",
        Path("scripts/deploy/06-verify.sh"),
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
        "clash subscription must not require ASN database",
        Path("."),
        "IP-" + "ASN,",
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
]


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def should_skip(path: Path) -> bool:
    rel_path = path.relative_to(PROJECT_ROOT)
    if any(rel_path == prefix or rel_path.is_relative_to(prefix) for prefix in LOCALIZED_STATIC_PREFIXES):
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
    sys.exit(main())
