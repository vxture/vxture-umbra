#!/usr/bin/env python3
"""Umbra account portal.

The portal is intentionally small and self-contained:
- Admins authenticate against Marzban and generate one-time invite codes.
- Invite codes bind to existing Marzban users such as USER08.
- End users register with an invite and then view only their own subscription.
"""

from __future__ import annotations

import base64
import datetime as dt
import hashlib
import hmac
import html
import json
import os
import re
import secrets
import sqlite3
import ssl
import time
import urllib.error
import urllib.parse
import urllib.request
from http import cookies
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any


LISTEN_HOST = os.environ.get("ACCOUNT_HOST", "0.0.0.0")
LISTEN_PORT = int(os.environ.get("ACCOUNT_PORT", "3281"))
DB_PATH = os.environ.get("ACCOUNT_DB_PATH", "/var/lib/umbra-account/account.db")
SESSION_SECRET = os.environ.get("ACCOUNT_SESSION_SECRET", "")
INVITE_SECRET = os.environ.get("ACCOUNT_INVITE_SECRET", "")
INVITE_TTL_DAYS = int(os.environ.get("ACCOUNT_INVITE_TTL_DAYS", "30"))
MARZBAN_BASE_URL = os.environ.get("MARZBAN_BASE_URL", "https://umbra-marzban:8000").rstrip("/")
MARZBAN_ADMIN_USER = os.environ.get("MARZBAN_ADMIN_USER", "")
MARZBAN_ADMIN_PASSWORD = os.environ.get("MARZBAN_ADMIN_PASSWORD", "")
PROFILE_PREFIX = (os.environ.get("SUB_PROFILE_PREFIX", "Ruyin").strip() or "Ruyin")
VXTURE_JWT_SECRET = os.environ.get("VXTURE_JWT_SECRET", os.environ.get("JWT_SECRET", ""))
VXTURE_COOKIE_ACCESS = os.environ.get("VXTURE_COOKIE_ACCESS", "ry_access_token")
VXTURE_LOGIN_URL = os.environ.get("VXTURE_LOGIN_URL", "https://console.vxture.com/zh-CN/signin")
VXTURE_SSO_URL = os.environ.get("VXTURE_SSO_URL", "")
PUBLIC_ACCOUNT_URL = os.environ.get("PUBLIC_ACCOUNT_URL", f"https://{os.environ.get('CONSOLE_DOMAIN', 'console.ruyin.ai')}").rstrip("/")

USER_RE = re.compile(r"^[A-Za-z][A-Za-z0-9_-]{1,63}$")
INVITE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
ADMIN_COOKIE = "umbra_admin"

# Application registry that drives the console launcher cards. Adding an app the
# launcher can show and bind is one entry here plus a broker branch in
# api_app_bind / api_app_action. See docs/design/platform-identity.md.
APPS: list[dict[str, Any]] = [
    {"key": "vpn", "name": "VPN", "href": "/apps/vpn", "enabled": True, "bindable": True, "secondaryAuth": False},
    {"key": "vault", "name": "Vault", "href": "", "enabled": False, "bindable": True, "secondaryAuth": True},
]


def require_secret(name: str, value: str) -> bytes:
    if len(value) < 32:
        raise SystemExit(f"{name} must be set to at least 32 characters")
    return value.encode("utf-8")


SESSION_KEY = require_secret("ACCOUNT_SESSION_SECRET", SESSION_SECRET)
INVITE_KEY = require_secret("ACCOUNT_INVITE_SECRET", INVITE_SECRET)
TLS_CONTEXT = ssl._create_unverified_context()


def utcnow() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0)


def iso_now() -> str:
    return utcnow().isoformat()


def parse_iso(value: str | None) -> dt.datetime | None:
    if not value:
        return None
    try:
        return dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def unb64url(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode((value + padding).encode("ascii"))


def sign_payload(payload: dict[str, Any]) -> str:
    body = b64url(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    sig = hmac.new(SESSION_KEY, body.encode("ascii"), hashlib.sha256).digest()
    return f"{body}.{b64url(sig)}"


def verify_payload(value: str | None) -> dict[str, Any] | None:
    if not value or "." not in value:
        return None
    body, sig = value.rsplit(".", 1)
    expected = b64url(hmac.new(SESSION_KEY, body.encode("ascii"), hashlib.sha256).digest())
    if not hmac.compare_digest(sig, expected):
        return None
    try:
        payload = json.loads(unb64url(body).decode("utf-8"))
    except Exception:
        return None
    exp = int(payload.get("exp", 0) or 0)
    if exp and exp < int(time.time()):
        return None
    return payload


def verify_vxture_jwt(value: str | None) -> dict[str, Any] | None:
    if not VXTURE_JWT_SECRET or not value or value.count(".") != 2:
        return None
    header_text, body_text, sig_text = value.split(".")
    try:
        header = json.loads(unb64url(header_text).decode("utf-8"))
        if header.get("alg") != "HS256":
            return None
        expected = hmac.new(
            VXTURE_JWT_SECRET.encode("utf-8"),
            f"{header_text}.{body_text}".encode("ascii"),
            hashlib.sha256,
        ).digest()
        if not hmac.compare_digest(sig_text, b64url(expected)):
            return None
        payload = json.loads(unb64url(body_text).decode("utf-8"))
    except Exception:
        return None
    exp = int(payload.get("exp", 0) or 0)
    if exp and exp < int(time.time()):
        return None
    if payload.get("userType") != "tenant_user" or payload.get("authScope") != "tenant-console":
        return None
    return payload


def public_vxture_user(payload: dict[str, Any]) -> dict[str, Any]:
    # Display fields (username handle, name, avatar) come from Vxture claims, the
    # source of truth. They may be empty until Vxture backfills the claims; the
    # UI falls back. See docs/design/platform-identity.md.
    return {
        "id": str(payload.get("sub") or ""),
        "email": str(payload.get("email") or ""),
        "username": str(payload.get("preferred_username") or payload.get("username") or ""),
        "displayName": str(payload.get("name") or payload.get("display_name") or ""),
        "avatarUrl": str(payload.get("picture") or payload.get("avatar") or ""),
        "tenantId": str(payload.get("tenantId") or ""),
        "role": str(payload.get("role") or "member"),
        "permissions": payload.get("permissions") if isinstance(payload.get("permissions"), list) else [],
        "provider": str(payload.get("provider") or ""),
    }


def invite_hash(code: str) -> str:
    normalized = code.strip().upper()
    return hmac.new(INVITE_KEY, normalized.encode("utf-8"), hashlib.sha256).hexdigest()


def session_hash(value: str) -> str:
    return hmac.new(SESSION_KEY, value.encode("utf-8"), hashlib.sha256).hexdigest()


def generate_invite_code() -> str:
    groups = []
    for _ in range(4):
        groups.append("".join(secrets.choice(INVITE_ALPHABET) for _ in range(4)))
    return "RY-" + "-".join(groups)


def invite_url(code: str | None) -> str | None:
    if not code:
        return None
    return f"{PUBLIC_ACCOUNT_URL}/register?invite={urllib.parse.quote(code)}"


def format_bytes(value: Any) -> str:
    try:
        size = float(value or 0)
    except (TypeError, ValueError):
        return "-"
    units = ["B", "KB", "MB", "GB", "TB", "PB"]
    for unit in units:
        if size < 1024 or unit == units[-1]:
            if unit == "B":
                return f"{int(size)} {unit}"
            return f"{size:.2f} {unit}"
        size /= 1024
    return "-"


def format_epoch(value: Any) -> str:
    try:
        ts = int(value)
    except (TypeError, ValueError):
        return "Unlimited"
    if ts <= 0:
        return "Unlimited"
    return dt.datetime.fromtimestamp(ts, dt.timezone.utc).strftime("%Y-%m-%d")


def format_datetime(value: Any) -> str:
    if not value:
        return "-"
    text = str(value)
    parsed = parse_iso(text)
    if parsed:
        return parsed.astimezone(dt.timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    return text


def db() -> sqlite3.Connection:
    db_dir = os.path.dirname(DB_PATH)
    if db_dir:
        os.makedirs(db_dir, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=15)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db() -> None:
    with db() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS accounts (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              username TEXT NOT NULL UNIQUE,
              display_name TEXT,
              display_name_key TEXT,
              -- Retired local-password IdP columns: kept NOT NULL for legacy rows.
              -- Vxture SSO is the sole identity source; binding writes inert
              -- placeholders here (see bind_invite_to_vxture_account).
              password_salt TEXT NOT NULL,
              password_hash TEXT NOT NULL,
              subscription_url TEXT NOT NULL,
              created_at TEXT NOT NULL,
              last_login_at TEXT,
              disabled INTEGER NOT NULL DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS invites (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              code_hash TEXT NOT NULL UNIQUE,
              code_plain TEXT,
              username TEXT NOT NULL,
              subscription_url TEXT NOT NULL,
              expires_at TEXT NOT NULL,
              used_at TEXT,
              used_by_account_id INTEGER,
              disabled INTEGER NOT NULL DEFAULT 0,
              created_at TEXT NOT NULL,
              FOREIGN KEY(used_by_account_id) REFERENCES accounts(id)
            );

            CREATE TABLE IF NOT EXISTS admin_sessions (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              session_hash TEXT NOT NULL UNIQUE,
              token TEXT NOT NULL,
              created_at TEXT NOT NULL,
              expires_at TEXT NOT NULL
            );

            CREATE UNIQUE INDEX IF NOT EXISTS idx_active_invite_username
              ON invites(username)
              WHERE used_at IS NULL AND disabled = 0;

            -- Multi-app authorization: one row per (identity, application).
            -- See docs/design/platform-identity.md.
            CREATE TABLE IF NOT EXISTS app_bindings (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              account_id INTEGER NOT NULL,
              app_key TEXT NOT NULL,
              status TEXT NOT NULL DEFAULT 'active',
              resource_ref TEXT,
              metadata TEXT,
              created_at TEXT NOT NULL,
              updated_at TEXT,
              FOREIGN KEY(account_id) REFERENCES accounts(id)
            );

            CREATE UNIQUE INDEX IF NOT EXISTS idx_app_binding_account_app
              ON app_bindings(account_id, app_key);

            """
        )
        columns = {row["name"] for row in conn.execute("PRAGMA table_info(accounts)").fetchall()}
        if "display_name" not in columns:
            conn.execute("ALTER TABLE accounts ADD COLUMN display_name TEXT")
        if "display_name_key" not in columns:
            conn.execute("ALTER TABLE accounts ADD COLUMN display_name_key TEXT")
        if "vxture_account_id" not in columns:
            conn.execute("ALTER TABLE accounts ADD COLUMN vxture_account_id TEXT")
        if "vxture_email" not in columns:
            conn.execute("ALTER TABLE accounts ADD COLUMN vxture_email TEXT")
        if "vxture_tenant_id" not in columns:
            conn.execute("ALTER TABLE accounts ADD COLUMN vxture_tenant_id TEXT")
        if "bound_at" not in columns:
            conn.execute("ALTER TABLE accounts ADD COLUMN bound_at TEXT")
        conn.execute(
            """
            UPDATE accounts
               SET display_name = username,
                   display_name_key = lower(username)
             WHERE display_name IS NULL OR display_name_key IS NULL
            """
        )
        conn.execute(
            """
            CREATE UNIQUE INDEX IF NOT EXISTS idx_account_display_name_key
              ON accounts(display_name_key)
              WHERE disabled = 0
            """
        )
        conn.execute(
            """
            CREATE UNIQUE INDEX IF NOT EXISTS idx_account_vxture_account_id
              ON accounts(vxture_account_id)
              WHERE vxture_account_id IS NOT NULL AND disabled = 0
            """
        )
        # Platform identity display field (sourced from Vxture claims; null until
        # Vxture backfills). display_name and last_login_at already exist; the
        # username display handle is introduced in a later step once read paths
        # move off the legacy accounts.username (which still holds the Marzban
        # user). See docs/design/platform-identity.md.
        if "avatar_url" not in columns:
            conn.execute("ALTER TABLE accounts ADD COLUMN avatar_url TEXT")

        # Generalize invites to carry the target application (default 'vpn').
        invite_columns = {row["name"] for row in conn.execute("PRAGMA table_info(invites)").fetchall()}
        if "app_key" not in invite_columns:
            conn.execute("ALTER TABLE invites ADD COLUMN app_key TEXT")
        if "resource_ref" not in invite_columns:
            conn.execute("ALTER TABLE invites ADD COLUMN resource_ref TEXT")
        if "metadata" not in invite_columns:
            conn.execute("ALTER TABLE invites ADD COLUMN metadata TEXT")
        legacy_invites = conn.execute(
            "SELECT id, username, subscription_url FROM invites "
            "WHERE app_key IS NULL OR app_key = '' OR resource_ref IS NULL OR metadata IS NULL"
        ).fetchall()
        for row in legacy_invites:
            meta = json.dumps({"subscription_url": row["subscription_url"]}, separators=(",", ":"))
            conn.execute(
                "UPDATE invites "
                "   SET app_key = COALESCE(NULLIF(app_key, ''), 'vpn'), "
                "       resource_ref = COALESCE(resource_ref, ?), "
                "       metadata = COALESCE(metadata, ?) "
                " WHERE id = ?",
                (row["username"], meta, row["id"]),
            )

        # Backfill the VPN binding for existing accounts (idempotent). Existing
        # accounts each represent one active VPN user; project that into
        # app_bindings without disturbing the legacy accounts columns.
        legacy_accounts = conn.execute(
            "SELECT id, username, subscription_url, bound_at, created_at "
            "  FROM accounts a "
            " WHERE NOT EXISTS ("
            "       SELECT 1 FROM app_bindings b "
            "        WHERE b.account_id = a.id AND b.app_key = 'vpn')"
        ).fetchall()
        for row in legacy_accounts:
            meta = json.dumps({"subscription_url": row["subscription_url"]}, separators=(",", ":"))
            created = row["bound_at"] or row["created_at"] or iso_now()
            conn.execute(
                "INSERT INTO app_bindings"
                "(account_id, app_key, status, resource_ref, metadata, created_at, updated_at) "
                "VALUES (?, 'vpn', 'active', ?, ?, ?, ?)",
                (row["id"], row["username"], meta, created, iso_now()),
            )


def request_json(url: str, token: str | None = None, data: dict[str, Any] | None = None, timeout: int = 10) -> dict[str, Any]:
    headers = {"Accept": "application/json", "Accept-Encoding": "identity"}
    body = None
    method = "GET"
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if data is not None:
        body = json.dumps(data).encode("utf-8")
        headers["Content-Type"] = "application/json"
        method = "POST"
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=timeout, context=TLS_CONTEXT) as res:
        raw = res.read()
        if not raw:
            return {}
        return json.loads(raw.decode("utf-8"))


def marzban_login(username: str, password: str) -> str:
    data = urllib.parse.urlencode({"username": username, "password": password}).encode("utf-8")
    req = urllib.request.Request(f"{MARZBAN_BASE_URL}/api/admin/token", data=data, method="POST")
    with urllib.request.urlopen(req, timeout=10, context=TLS_CONTEXT) as res:
        payload = json.loads(res.read().decode("utf-8"))
    token = payload.get("access_token")
    if not isinstance(token, str) or not token:
        raise ValueError("missing access token")
    return token


def marzban_user(token: str, username: str) -> dict[str, Any]:
    safe = urllib.parse.quote(username, safe="")
    return request_json(f"{MARZBAN_BASE_URL}/api/user/{safe}", token=token)


def marzban_users(token: str) -> list[dict[str, Any]]:
    payload = request_json(f"{MARZBAN_BASE_URL}/api/users?limit=1000&sort=username", token=token)
    if isinstance(payload, list):
        return [item for item in payload if isinstance(item, dict)]
    for key in ("users", "items", "data", "results"):
        value = payload.get(key)
        if isinstance(value, list):
            return [item for item in value if isinstance(item, dict)]
    return []


def fetch_marzban_subscription_url(username: str) -> str | None:
    if not MARZBAN_ADMIN_USER or not MARZBAN_ADMIN_PASSWORD:
        return None
    token = marzban_login(MARZBAN_ADMIN_USER, MARZBAN_ADMIN_PASSWORD)
    user = marzban_user(token, username)
    sub_url = user.get("subscription_url")
    if not isinstance(sub_url, str) or "/sub/" not in sub_url:
        return None
    token_path_from_url(sub_url)
    return sub_url


def reset_bound_account_subscription_url(username: str) -> str:
    try:
        fresh_sub_url = fetch_marzban_subscription_url(username)
        if not fresh_sub_url:
            return "failed"
        with db() as conn:
            account = conn.execute(
                "SELECT subscription_url FROM accounts WHERE username = ? AND disabled = 0",
                (username,),
            ).fetchone()
            if not account:
                return "failed"
            changed = fresh_sub_url != account["subscription_url"]
            if changed:
                conn.execute("UPDATE accounts SET subscription_url = ? WHERE username = ?", (fresh_sub_url, username))
            # Keep the VPN app binding metadata in sync (user-side source of truth).
            conn.execute(
                "UPDATE app_bindings SET metadata = ?, updated_at = ? WHERE app_key = 'vpn' AND resource_ref = ?",
                (json.dumps({"subscription_url": fresh_sub_url}, separators=(",", ":")), iso_now(), username),
            )
            return "updated" if changed else "current"
    except Exception:
        return "failed"


def token_path_from_url(subscription_url: str) -> str:
    parsed = urllib.parse.urlsplit(subscription_url)
    if not parsed.path.startswith("/sub/"):
        raise ValueError("subscription URL is not a /sub/<token> URL")
    return parsed.path


def subscription_info(subscription_url: str) -> dict[str, Any]:
    path = token_path_from_url(subscription_url)
    return request_json(f"{MARZBAN_BASE_URL}{path}/info", timeout=10)


def account_for_vxture_user(vxture_user_id: str) -> sqlite3.Row | None:
    if not vxture_user_id:
        return None
    with db() as conn:
        return conn.execute(
            "SELECT * FROM accounts WHERE vxture_account_id = ? AND disabled = 0",
            (vxture_user_id,),
        ).fetchone()


def account_payload(row: sqlite3.Row | None) -> dict[str, Any] | None:
    if not row:
        return None
    sub_url = row["subscription_url"]
    try:
        info = subscription_info(sub_url)
    except Exception:
        info = {}
    used = int(info.get("used_traffic") or 0)
    total = int(info.get("data_limit") or 0)
    return {
        "username": row["username"],
        "displayName": row["display_name"] or row["username"],
        "profileName": f"{PROFILE_PREFIX}-{row['username']}",
        "subscriptionUrl": sub_url,
        "status": str(info.get("status") or "unknown"),
        "usedTraffic": used,
        "dataLimit": total,
        "remainingTraffic": max(total - used, 0) if total else 0,
        "expire": info.get("expire"),
        "onlineAt": info.get("online_at"),
        "usedText": format_bytes(used),
        "dataLimitText": format_bytes(total) if total else "Unlimited",
        "remainingText": format_bytes(max(total - used, 0)) if total else "Unlimited",
        "expireText": format_epoch(info.get("expire")),
        "onlineText": format_datetime(info.get("online_at")),
        "vxtureAccountId": row["vxture_account_id"],
        "vxtureEmail": row["vxture_email"],
        "vxtureTenantId": row["vxture_tenant_id"],
    }


def bindings_for_account(account_id: int | None) -> dict[str, sqlite3.Row]:
    if not account_id:
        return {}
    with db() as conn:
        rows = conn.execute("SELECT * FROM app_bindings WHERE account_id = ?", (account_id,)).fetchall()
    return {str(row["app_key"]): row for row in rows}


def apps_for_account(account_row: sqlite3.Row | None) -> list[dict[str, Any]]:
    bindings = bindings_for_account(account_row["id"] if account_row else None)
    result: list[dict[str, Any]] = []
    for app in APPS:
        binding = bindings.get(app["key"])
        if not app["enabled"]:
            status = "disabled"
        elif binding and str(binding["status"]) == "active":
            status = "active"
        else:
            status = "unbound"
        result.append(
            {
                "key": app["key"],
                "name": app["name"],
                "href": app["href"],
                "bindable": app["bindable"],
                "secondaryAuth": app["secondaryAuth"],
                "status": status,
            }
        )
    return result


def bind_invite_to_vxture_account(code: str, user: dict[str, Any]) -> dict[str, Any]:
    user_id = str(user.get("id") or "")
    if not user_id:
        raise ValueError("No active Vxture session.")
    if account_for_vxture_user(user_id):
        raise ValueError("This Vxture account is already bound.")

    code_digest = invite_hash(code)
    conn: sqlite3.Connection | None = None
    try:
        conn = db()
        conn.execute("BEGIN IMMEDIATE")
        invite = conn.execute("SELECT * FROM invites WHERE code_hash = ?", (code_digest,)).fetchone()
        if not invite or invite["disabled"] or invite["used_at"]:
            raise ValueError("Invitation is invalid or already used.")
        expires = parse_iso(invite["expires_at"])
        if expires and expires < utcnow():
            raise ValueError("Invitation is invalid or already used.")
        if conn.execute("SELECT id FROM accounts WHERE username = ?", (invite["username"],)).fetchone():
            raise ValueError("This user code is already bound.")

        info = subscription_info(invite["subscription_url"])
        if info.get("username") != invite["username"]:
            raise ValueError("Invitation target could not be verified.")

        display_name = str(user.get("email") or user_id)
        display_name_key = display_name.casefold()
        now = iso_now()
        cur = conn.execute(
            """
            INSERT INTO accounts(
              username, display_name, display_name_key,
              password_salt, password_hash, subscription_url, created_at,
              vxture_account_id, vxture_email, vxture_tenant_id, bound_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                invite["username"],
                display_name,
                display_name_key,
                "vxture-sso",
                "vxture-sso",
                invite["subscription_url"],
                now,
                user_id,
                user.get("email") or "",
                user.get("tenantId") or "",
                now,
            ),
        )
        account_id = cur.lastrowid
        binding_meta = invite["metadata"] or json.dumps(
            {"subscription_url": invite["subscription_url"]}, separators=(",", ":")
        )
        conn.execute(
            """
            INSERT OR IGNORE INTO app_bindings(
              account_id, app_key, status, resource_ref, metadata, created_at, updated_at
            )
            VALUES (?, ?, 'active', ?, ?, ?, ?)
            """,
            (
                account_id,
                invite["app_key"] or "vpn",
                invite["resource_ref"] or invite["username"],
                binding_meta,
                now,
                now,
            ),
        )
        conn.execute(
            """
            UPDATE invites
               SET used_at = ?, used_by_account_id = ?, code_plain = NULL
             WHERE id = ?
            """,
            (now, account_id, invite["id"]),
        )
        conn.commit()
    except Exception:
        if conn is not None:
            conn.rollback()
        raise
    finally:
        if conn is not None:
            conn.close()

    account = account_for_vxture_user(user_id)
    return account_payload(account) or {}


def marzban_admin_token() -> str:
    if not MARZBAN_ADMIN_USER or not MARZBAN_ADMIN_PASSWORD:
        raise ValueError("Marzban admin credentials are not configured.")
    return marzban_login(MARZBAN_ADMIN_USER, MARZBAN_ADMIN_PASSWORD)


def get_cookie(header: str | None, name: str) -> str | None:
    if not header:
        return None
    jar = cookies.SimpleCookie()
    try:
        jar.load(header)
    except cookies.CookieError:
        return None
    morsel = jar.get(name)
    return morsel.value if morsel else None


def page(title: str, body: str, *, narrow: bool = False) -> bytes:
    width = "480px" if narrow else "1040px"
    html_text = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{html.escape(title)} - Ruyin</title>
  <style>
    :root {{
      color-scheme: dark;
      --bg: #07121d;
      --panel: rgba(11, 26, 39, .84);
      --line: rgba(142, 199, 255, .18);
      --text: #edf6ff;
      --muted: #95a8ba;
      --accent: #68e1fd;
      --accent2: #8ee6a8;
      --danger: #ff7b7b;
    }}
    * {{ box-sizing: border-box; }}
    body {{
      margin: 0;
      min-height: 100vh;
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: var(--text);
      background:
        radial-gradient(circle at 20% 10%, rgba(104, 225, 253, .18), transparent 28%),
        radial-gradient(circle at 90% 0%, rgba(142, 230, 168, .14), transparent 28%),
        linear-gradient(135deg, #07121d, #0b1827 54%, #09151f);
    }}
    a {{ color: var(--accent); text-decoration: none; }}
    .shell {{ width: min(calc(100% - 32px), {width}); margin: 0 auto; padding: 36px 0; }}
    .top {{ display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 28px; }}
    .brand {{ font-weight: 700; letter-spacing: .04em; }}
    .muted {{ color: var(--muted); }}
    .panel {{
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      box-shadow: 0 20px 60px rgba(0,0,0,.28);
      padding: 24px;
    }}
    h1 {{ margin: 0 0 8px; font-size: clamp(26px, 4vw, 42px); letter-spacing: 0; }}
    h2 {{ margin: 0 0 16px; font-size: 20px; }}
    p {{ line-height: 1.65; }}
    form {{ display: grid; gap: 14px; }}
    label {{ display: grid; gap: 8px; color: var(--muted); font-size: 14px; }}
    input {{
      width: 100%;
      padding: 12px 13px;
      border-radius: 6px;
      border: 1px solid var(--line);
      background: rgba(255,255,255,.055);
      color: var(--text);
      outline: none;
    }}
    input:focus {{ border-color: rgba(104, 225, 253, .7); }}
    button, .button {{
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 40px;
      padding: 0 16px;
      border-radius: 6px;
      border: 1px solid rgba(104,225,253,.44);
      background: rgba(104,225,253,.14);
      color: var(--text);
      cursor: pointer;
      font-weight: 650;
    }}
    .button.secondary, button.secondary {{ border-color: var(--line); background: rgba(255,255,255,.06); }}
    .button.danger, button.danger {{
      border-color: rgba(255,123,123,.58);
      background: rgba(255,123,123,.14);
      color: #ffd2d2;
    }}
    .row {{ display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }}
    .grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 12px; }}
    .metric {{ border: 1px solid var(--line); border-radius: 8px; padding: 14px; background: rgba(255,255,255,.045); }}
    .metric .value {{ font-size: 22px; font-weight: 750; margin-top: 4px; }}
    .alert {{ border: 1px solid rgba(255,123,123,.34); color: #ffd2d2; background: rgba(255,123,123,.09); padding: 12px; border-radius: 6px; }}
    .ok {{ border-color: rgba(142,230,168,.34); color: #d7ffe1; background: rgba(142,230,168,.09); }}
    table {{ width: 100%; border-collapse: collapse; overflow: hidden; }}
    th, td {{ padding: 11px 10px; border-bottom: 1px solid var(--line); text-align: left; font-size: 14px; }}
    th {{ color: var(--muted); font-weight: 600; }}
    code {{ color: #d7ffe1; word-break: break-all; }}
    .split {{ display: grid; grid-template-columns: minmax(0, 1fr) minmax(280px, 360px); gap: 16px; }}
    @media (max-width: 760px) {{ .split {{ grid-template-columns: 1fr; }} .top {{ align-items: flex-start; flex-direction: column; }} }}
  </style>
</head>
<body>
  <main class="shell">
    <div class="top">
      <div>
        <div class="brand">RUYIN</div>
        <div class="muted">Subscription Portal</div>
      </div>
    </div>
    {body}
  </main>
</body>
</html>"""
    return html_text.encode("utf-8")


class AccountHandler(BaseHTTPRequestHandler):
    server_version = "UmbraAccount/1.0"

    def do_GET(self) -> None:
        path = urllib.parse.urlsplit(self.path).path
        if path == "/health":
            self.text(200, "ok\n")
        elif path == "/api/account/health":
            self.json(200, {"status": "ok"})
        elif path == "/api/account/session":
            self.api_session()
        elif path == "/api/account/dashboard":
            self.api_dashboard()
        elif path == "/api/account/admin/invites":
            self.api_admin_invites()
        elif path in {"/invites", "/invites/"}:
            self.admin_invites()
        else:
            self.not_found()

    def do_POST(self) -> None:
        path = urllib.parse.urlsplit(self.path).path
        if path.startswith("/api/account/apps/"):
            self.api_app_post(path)
            return
        if path == "/api/account/bind-invite":
            self.api_bind_invite()
        elif path == "/api/account/reset-subscription":
            self.api_reset_subscription()
        elif path == "/api/account/logout":
            self.api_logout()
        elif path == "/api/account/admin/login":
            self.api_admin_login()
        elif path == "/api/account/admin/logout":
            self.api_admin_logout()
        elif path == "/api/account/admin/invites":
            self.api_admin_create_invite()
        elif path == "/api/account/admin/reset-subscription":
            self.api_admin_reset_subscription()
        elif path == "/api/account/admin/revoke":
            self.api_admin_revoke_invite()
        elif path == "/invites/login":
            self.admin_login()
        elif path == "/invites/logout":
            self.admin_logout()
        elif path == "/invites/create":
            self.admin_create_invite()
        elif path == "/invites/reset-subscription":
            self.admin_reset_subscription()
        elif path == "/invites/revoke":
            self.admin_revoke_invite()
        else:
            self.not_found()

    def form(self) -> dict[str, str]:
        length = int(self.headers.get("Content-Length", "0") or "0")
        raw = self.rfile.read(length).decode("utf-8", errors="replace")
        parsed = urllib.parse.parse_qs(raw, keep_blank_values=True)
        return {key: values[-1].strip() for key, values in parsed.items()}

    def json_body(self) -> dict[str, Any]:
        length = int(self.headers.get("Content-Length", "0") or "0")
        if length <= 0:
            return {}
        raw = self.rfile.read(length).decode("utf-8", errors="replace")
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError:
            return {}
        return payload if isinstance(payload, dict) else {}

    def current_vxture_payload(self) -> dict[str, Any] | None:
        return verify_vxture_jwt(get_cookie(self.headers.get("Cookie"), VXTURE_COOKIE_ACCESS))

    def current_vxture_user(self) -> dict[str, Any] | None:
        payload = self.current_vxture_payload()
        return public_vxture_user(payload) if payload else None

    def admin_session(self) -> dict[str, Any] | None:
        payload = verify_payload(get_cookie(self.headers.get("Cookie"), ADMIN_COOKIE))
        if not payload or payload.get("role") != "admin":
            return None
        sid = str(payload.get("sid") or "")
        if not sid:
            return None
        with db() as conn:
            row = conn.execute(
                "SELECT token, expires_at FROM admin_sessions WHERE session_hash = ?",
                (session_hash(sid),),
            ).fetchone()
            if not row:
                return None
            expires = parse_iso(row["expires_at"])
            if expires and expires < utcnow():
                conn.execute("DELETE FROM admin_sessions WHERE session_hash = ?", (session_hash(sid),))
                return None
        return {"role": "admin", "sid": sid, "token": row["token"]}

    def send_cookie(self, name: str, value: str, *, max_age: int, path: str = "/") -> None:
        self.send_header(
            "Set-Cookie",
            f"{name}={value}; Max-Age={max_age}; Path={path}; HttpOnly; Secure; SameSite=Lax",
        )

    def clear_cookie(self, name: str, *, path: str = "/") -> None:
        self.send_header(
            "Set-Cookie",
            f"{name}=; Max-Age=0; Path={path}; HttpOnly; Secure; SameSite=Lax",
        )

    def html(self, status: int, content: bytes, extra_headers: dict[str, str] | None = None) -> None:
        self.send_response(status)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(content)))
        if extra_headers:
            for key, value in extra_headers.items():
                self.send_header(key, value)
        self.end_headers()
        self.wfile.write(content)

    def json(self, status: int, payload: dict[str, Any] | list[Any]) -> None:
        raw = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def text(self, status: int, content: str) -> None:
        raw = content.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def redirect(self, target: str, cookies_to_clear: list[tuple[str, str]] | None = None) -> None:
        self.send_response(303)
        self.send_header("Location", target)
        if cookies_to_clear:
            for name, path in cookies_to_clear:
                self.clear_cookie(name, path=path)
        self.end_headers()

    def not_found(self) -> None:
        self.text(404, "not found\n")

    def api_unauthorized(self) -> None:
        self.json(401, {"status": "anonymous", "loginUrl": VXTURE_LOGIN_URL, "ssoUrl": VXTURE_SSO_URL})

    def api_forbidden(self) -> None:
        self.json(403, {"status": "forbidden"})

    def api_session(self) -> None:
        auth_config = {"loginUrl": VXTURE_LOGIN_URL, "ssoUrl": VXTURE_SSO_URL}
        user = self.current_vxture_user()
        if not user:
            self.json(200, {"status": "anonymous", **auth_config})
            return
        account = account_for_vxture_user(str(user["id"]))
        self.json(
            200,
            {
                "status": "active",
                "user": user,
                "account": account_payload(account),
                "apps": apps_for_account(account),
                **auth_config,
            },
        )

    def api_logout(self) -> None:
        # Clear the Vxture SSO access cookie this portal reads. The cookie may
        # also be set on a shared parent domain by the SSO upstream; clearing it
        # here removes the console-domain copy. The client then reloads into the
        # anonymous SSO sign-in view.
        body = b'{"status":"ok"}'
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.clear_cookie(VXTURE_COOKIE_ACCESS, path="/")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def api_dashboard(self) -> None:
        user = self.current_vxture_user()
        if not user:
            self.api_unauthorized()
            return
        account = account_for_vxture_user(str(user["id"]))
        if not account:
            self.json(404, {"status": "unbound", "user": user})
            return
        self.json(200, {"status": "bound", "user": user, "account": account_payload(account)})

    def api_bind_invite(self) -> None:
        user = self.current_vxture_user()
        if not user:
            self.api_unauthorized()
            return
        code = str(self.json_body().get("inviteCode") or "")
        try:
            account = bind_invite_to_vxture_account(code, user)
        except ValueError as exc:
            self.json(400, {"status": "failed", "message": str(exc)})
            return
        except Exception:
            self.json(500, {"status": "failed", "message": "Invitation target could not be verified."})
            return
        self.json(200, {"status": "bound", "account": account})

    def api_reset_subscription(self) -> None:
        user = self.current_vxture_user()
        if not user:
            self.api_unauthorized()
            return
        account = account_for_vxture_user(str(user["id"]))
        if not account:
            self.json(404, {"status": "unbound"})
            return
        status = reset_bound_account_subscription_url(str(account["username"]))
        account = account_for_vxture_user(str(user["id"]))
        self.json(200, {"status": status, "account": account_payload(account)})

    # -- Application-keyed surface (launcher cards bind/act per app) -----------
    def api_app_post(self, path: str) -> None:
        parts = [segment for segment in path[len("/api/account/apps/"):].split("/") if segment]
        app_key = parts[0] if parts else ""
        if not any(app["key"] == app_key and app["enabled"] for app in APPS):
            self.not_found()
            return
        if len(parts) == 2 and parts[1] == "bind":
            self.api_app_bind(app_key)
            return
        if len(parts) == 3 and parts[1] == "action":
            self.api_app_action(app_key, parts[2])
            return
        self.not_found()

    def api_app_bind(self, app_key: str) -> None:
        user = self.current_vxture_user()
        if not user:
            self.api_unauthorized()
            return
        code = str(self.json_body().get("inviteCode") or "")
        try:
            bind_invite_to_vxture_account(code, user)
        except ValueError as exc:
            self.json(400, {"status": "failed", "message": str(exc)})
            return
        except Exception:
            self.json(500, {"status": "failed", "message": "Invitation target could not be verified."})
            return
        account = account_for_vxture_user(str(user["id"]))
        self.json(200, {"status": "bound", "account": account_payload(account), "apps": apps_for_account(account)})

    def api_app_action(self, app_key: str, name: str) -> None:
        user = self.current_vxture_user()
        if not user:
            self.api_unauthorized()
            return
        account = account_for_vxture_user(str(user["id"]))
        if not account:
            self.json(404, {"status": "unbound"})
            return
        if app_key == "vpn" and name == "reset":
            status = reset_bound_account_subscription_url(str(account["username"]))
            account = account_for_vxture_user(str(user["id"]))
            self.json(200, {"status": status, "account": account_payload(account), "apps": apps_for_account(account)})
            return
        self.not_found()

    def create_admin_session(self, token: str) -> str:
        sid = b64url(secrets.token_bytes(32))
        expires_ts = int(time.time()) + 3600 * 8
        expires_at = dt.datetime.fromtimestamp(expires_ts, dt.timezone.utc).replace(microsecond=0).isoformat()
        with db() as conn:
            conn.execute("DELETE FROM admin_sessions WHERE expires_at < ?", (iso_now(),))
            conn.execute(
                "INSERT INTO admin_sessions(session_hash, token, created_at, expires_at) VALUES (?, ?, ?, ?)",
                (session_hash(sid), token, iso_now(), expires_at),
            )
        return sign_payload({"role": "admin", "sid": sid, "exp": expires_ts})

    def require_invite_admin(self) -> dict[str, Any] | None:
        sess = self.admin_session()
        if not sess:
            self.json(401, {"status": "admin_login_required"})
            return None
        return sess

    def api_admin_login(self) -> None:
        data = self.json_body()
        try:
            token = marzban_login(str(data.get("username") or ""), str(data.get("password") or ""))
        except Exception:
            self.json(401, {"status": "failed", "message": "Invalid Marzban admin credentials."})
            return

        raw = json.dumps({"status": "ok"}, separators=(",", ":")).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.send_cookie(ADMIN_COOKIE, self.create_admin_session(token), max_age=3600 * 8, path="/api/account/admin")
        self.end_headers()
        self.wfile.write(raw)

    def api_admin_logout(self) -> None:
        sess = self.admin_session()
        if sess:
            with db() as conn:
                conn.execute("DELETE FROM admin_sessions WHERE session_hash = ?", (session_hash(str(sess["sid"])),))
        raw = json.dumps({"status": "ok"}, separators=(",", ":")).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.clear_cookie(ADMIN_COOKIE, path="/api/account/admin")
        self.clear_cookie(ADMIN_COOKIE, path="/invites")
        self.end_headers()
        self.wfile.write(raw)

    def api_admin_invites(self) -> None:
        sess = self.require_invite_admin()
        if not sess:
            return
        try:
            users = marzban_users(str(sess["token"]))
        except Exception:
            self.json(502, {"status": "marzban_unavailable", "users": []})
            return
        with db() as conn:
            active_invites = conn.execute(
                "SELECT * FROM invites WHERE used_at IS NULL AND disabled = 0 ORDER BY created_at DESC"
            ).fetchall()
            accounts = conn.execute(
                "SELECT username, display_name, subscription_url, created_at, last_login_at, disabled, vxture_account_id, vxture_email, vxture_tenant_id FROM accounts ORDER BY username"
            ).fetchall()

        accounts_by_user = {row["username"]: row for row in accounts}
        invites_by_user = {row["username"]: row for row in active_invites}
        rows = []
        for item in sorted(users, key=lambda user: str(user.get("username") or "").upper()):
            username = str(item.get("username") or "")
            if not username:
                continue
            account = accounts_by_user.get(username)
            invite = invites_by_user.get(username)
            state = "pending_binding"
            invite_code = None
            subscription_url = None
            display_name = None
            if account:
                state = "bound"
                subscription_url = account["subscription_url"]
                display_name = account["display_name"] or username
            elif invite:
                state = "invite_pending"
                invite_code = invite["code_plain"]
            rows.append(
                {
                    "username": username,
                    "status": str(item.get("status") or "-"),
                    "usedTraffic": int(item.get("used_traffic") or 0),
                    "dataLimit": int(item.get("data_limit") or 0),
                    "usedText": format_bytes(item.get("used_traffic")),
                    "dataLimitText": format_bytes(item.get("data_limit")) if item.get("data_limit") else "Unlimited",
                    "expireText": format_epoch(item.get("expire")),
                    "onlineText": format_datetime(item.get("online_at")),
                    "bindingState": state,
                    "displayName": display_name,
                    "inviteCode": invite_code,
                    "inviteUrl": invite_url(invite_code),
                    "inviteId": invite["id"] if invite else None,
                    "subscriptionUrl": subscription_url,
                }
            )
        self.json(
            200,
            {
                "status": "ok",
                "users": rows,
                "summary": {
                    "users": len(rows),
                    "bound": sum(1 for row in rows if row["bindingState"] == "bound"),
                    "invitePending": sum(1 for row in rows if row["bindingState"] == "invite_pending"),
                    "pendingBinding": sum(1 for row in rows if row["bindingState"] == "pending_binding"),
                },
            },
        )

    def api_admin_create_invite(self) -> None:
        sess = self.require_invite_admin()
        if not sess:
            return
        username = str(self.json_body().get("username") or "").upper()
        if not USER_RE.match(username):
            self.json(400, {"status": "failed", "message": "Invalid username."})
            return
        try:
            user = marzban_user(str(sess["token"]), username)
        except Exception:
            self.json(502, {"status": "failed", "message": "Marzban user could not be loaded."})
            return
        sub_url = user.get("subscription_url")
        if not isinstance(sub_url, str) or "/sub/" not in sub_url:
            self.json(502, {"status": "failed", "message": "Marzban subscription URL is missing."})
            return
        code = generate_invite_code()
        expires_at = (utcnow() + dt.timedelta(days=INVITE_TTL_DAYS)).isoformat()
        with db() as conn:
            conn.execute("BEGIN IMMEDIATE")
            conn.execute(
                "UPDATE invites SET disabled = 1, code_plain = NULL WHERE username = ? AND used_at IS NULL AND disabled = 0",
                (username,),
            )
            if conn.execute("SELECT id FROM accounts WHERE username = ?", (username,)).fetchone():
                conn.rollback()
                self.json(409, {"status": "failed", "message": "User is already bound."})
                return
            conn.execute(
                """
                INSERT INTO invites(code_hash, code_plain, username, subscription_url, expires_at, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (invite_hash(code), code, username, sub_url, expires_at, iso_now()),
            )
            conn.commit()
        self.json(200, {"status": "created", "username": username, "inviteCode": code, "inviteUrl": invite_url(code)})

    def api_admin_reset_subscription(self) -> None:
        if not self.require_invite_admin():
            return
        username = str(self.json_body().get("username") or "").upper()
        if not USER_RE.match(username):
            self.json(400, {"status": "failed"})
            return
        self.json(200, {"status": reset_bound_account_subscription_url(username)})

    def api_admin_revoke_invite(self) -> None:
        if not self.require_invite_admin():
            return
        invite_id = self.json_body().get("id")
        if not isinstance(invite_id, int):
            self.json(400, {"status": "failed"})
            return
        with db() as conn:
            conn.execute(
                "UPDATE invites SET disabled = 1, code_plain = NULL WHERE id = ? AND used_at IS NULL",
                (invite_id,),
            )
        self.json(200, {"status": "revoked"})

    def admin_login_form(self, error: str = "") -> bytes:
        alert = f'<div class="alert">{html.escape(error)}</div>' if error else ""
        body = f"""
<section class="panel">
  <h1>Invite Console</h1>
  <p class="muted">Sign in with a Marzban admin account to generate one-time user invites.</p>
  {alert}
  <form method="post" action="/invites/login">
    <label>Admin username<input name="username" autocomplete="username" required></label>
    <label>Admin password<input name="password" type="password" autocomplete="current-password" required></label>
    <button type="submit">Open invite console</button>
  </form>
</section>"""
        return page("Invite Console", body, narrow=True)

    def admin_invites(self) -> None:
        sess = self.admin_session()
        if not sess:
            self.html(200, self.admin_login_form())
            return
        with db() as conn:
            active_invites = conn.execute(
                "SELECT * FROM invites WHERE used_at IS NULL AND disabled = 0 ORDER BY created_at DESC"
            ).fetchall()
            accounts = conn.execute(
                "SELECT username, display_name, subscription_url, created_at, last_login_at, disabled FROM accounts ORDER BY username"
            ).fetchall()

        try:
            users = marzban_users(str(sess["token"]))
        except urllib.error.HTTPError as exc:
            if exc.code in {401, 403}:
                self.redirect("/invites/", cookies_to_clear=[(ADMIN_COOKIE, "/invites")])
                return
            users = []
        except Exception:
            users = []

        accounts_by_user = {row["username"]: row for row in accounts}
        invites_by_user = {row["username"]: row for row in active_invites}

        def user_name(user: dict[str, Any]) -> str:
            value = user.get("username")
            return str(value or "")

        users = sorted((user for user in users if user_name(user)), key=lambda item: user_name(item).upper())

        user_rows = []
        bound_count = 0
        invite_count = 0
        pending_count = 0
        query = urllib.parse.parse_qs(urllib.parse.urlsplit(self.path).query)
        update_status = query.get("subscription", [""])[0]
        if update_status == "updated":
            notice = '<div class="alert ok">Subscription URL reset.</div>'
        elif update_status == "current":
            notice = '<div class="alert ok">Subscription URL already matches Marzban.</div>'
        elif update_status == "failed":
            notice = '<div class="alert">Subscription URL could not be reset.</div>'
        else:
            notice = ""

        for user in users:
            username = user_name(user)
            account = accounts_by_user.get(username)
            invite = invites_by_user.get(username)
            status = str(user.get("status") or "-")
            used = format_bytes(user.get("used_traffic"))
            total = format_bytes(user.get("data_limit")) if user.get("data_limit") else "Unlimited"
            expire = format_epoch(user.get("expire"))
            online = format_datetime(user.get("online_at"))
            if account:
                bound_count += 1
                sub_id = f"sub-{html.escape(username)}"
                binding = f"Bound: {html.escape(account['display_name'] or username)}"
                invite_cell = f'<code id="{sub_id}">{html.escape(account["subscription_url"] or "-")}</code>'
                action = (
                    f'<button class="secondary" type="button" data-copy="{sub_id}">Copy URL</button>'
                    '<form method="post" action="/invites/reset-subscription">'
                    f'<input type="hidden" name="username" value="{html.escape(username)}">'
                    '<button class="danger" type="submit">Reset URL</button>'
                    '</form>'
                )
            elif invite:
                invite_count += 1
                code_id = f"invite-{invite['id']}"
                binding = "Invite pending"
                invite_cell = f'<code id="{code_id}">{html.escape(invite["code_plain"] or "-")}</code>'
                action = (
                    f'<button class="secondary" type="button" data-copy="{code_id}">Copy</button>'
                    f'<form method="post" action="/invites/revoke"><input type="hidden" name="id" value="{invite["id"]}"><button class="secondary" type="submit">Revoke</button></form>'
                )
            else:
                pending_count += 1
                binding = "Pending binding"
                invite_cell = "-"
                action = (
                    '<form method="post" action="/invites/create">'
                    f'<input type="hidden" name="username" value="{html.escape(username)}">'
                    '<button type="submit">Generate invite</button>'
                    '</form>'
                )
            user_rows.append(
                "<tr>"
                f"<td>{html.escape(username)}</td>"
                f"<td>{html.escape(status)}</td>"
                f"<td>{html.escape(used)}</td>"
                f"<td>{html.escape(total)}</td>"
                f"<td>{html.escape(expire)}</td>"
                f"<td>{html.escape(online)}</td>"
                f"<td>{binding}</td>"
                f"<td>{invite_cell}</td>"
                f"<td>{action}</td>"
                "</tr>"
            )

        body = f"""
<section class="split">
  <div class="panel">
    <h1>Invite Console</h1>
    <p class="muted">All existing Marzban users are listed below. Generate an invite only for users that are not yet bound.</p>
    {notice}
    <div class="grid">
      <div class="metric"><div class="muted">Users</div><div class="value">{len(users)}</div></div>
      <div class="metric"><div class="muted">Bound</div><div class="value">{bound_count}</div></div>
      <div class="metric"><div class="muted">Invite pending</div><div class="value">{invite_count}</div></div>
      <div class="metric"><div class="muted">Pending binding</div><div class="value">{pending_count}</div></div>
    </div>
  </div>
  <aside class="panel">
    <h2>Admin session</h2>
    <form method="post" action="/invites/logout"><button class="secondary" type="submit">Sign out</button></form>
  </aside>
</section>
<section class="panel" style="margin-top:16px">
  <h2>Marzban users</h2>
  <table><thead><tr><th>User code</th><th>Service status</th><th>Used</th><th>Total</th><th>Expire</th><th>Last online</th><th>Binding</th><th>Subscription / Invite</th><th></th></tr></thead><tbody>{''.join(user_rows) or '<tr><td colspan="9" class="muted">No Marzban users returned.</td></tr>'}</tbody></table>
</section>
<script>
document.addEventListener("click", function (event) {{
  var target = event.target;
  if (!target || !target.dataset || !target.dataset.copy) return;
  var source = document.getElementById(target.dataset.copy);
  if (!source || !navigator.clipboard) return;
  navigator.clipboard.writeText(source.textContent || "");
}});
</script>"""
        self.html(200, page("Invite Console", body))

    def admin_login(self) -> None:
        data = self.form()
        try:
            token = marzban_login(data.get("username", ""), data.get("password", ""))
        except Exception:
            self.html(401, self.admin_login_form("Invalid Marzban admin credentials."))
            return
        self.send_response(303)
        self.send_header("Location", "/invites/")
        self.send_cookie(ADMIN_COOKIE, self.create_admin_session(token), max_age=3600 * 8, path="/invites")
        self.end_headers()

    def admin_logout(self) -> None:
        sess = self.admin_session()
        if sess:
            with db() as conn:
                conn.execute("DELETE FROM admin_sessions WHERE session_hash = ?", (session_hash(str(sess["sid"])),))
        self.redirect("/invites/", cookies_to_clear=[(ADMIN_COOKIE, "/invites")])

    def admin_create_invite(self) -> None:
        sess = self.admin_session()
        if not sess:
            self.redirect("/invites/")
            return
        username = self.form().get("username", "").upper()
        if not USER_RE.match(username):
            self.redirect("/invites/")
            return
        try:
            user = marzban_user(str(sess["token"]), username)
        except urllib.error.HTTPError:
            self.redirect("/invites/")
            return
        except Exception:
            self.redirect("/invites/")
            return
        sub_url = user.get("subscription_url")
        if not isinstance(sub_url, str) or "/sub/" not in sub_url:
            self.redirect("/invites/")
            return
        code = generate_invite_code()
        expires_at = (utcnow() + dt.timedelta(days=INVITE_TTL_DAYS)).isoformat()
        with db() as conn:
            conn.execute("BEGIN IMMEDIATE")
            conn.execute(
                "UPDATE invites SET disabled = 1, code_plain = NULL WHERE username = ? AND used_at IS NULL AND disabled = 0",
                (username,),
            )
            if conn.execute("SELECT id FROM accounts WHERE username = ?", (username,)).fetchone():
                conn.rollback()
                self.redirect("/invites/")
                return
            conn.execute(
                """
                INSERT INTO invites(code_hash, code_plain, username, subscription_url, expires_at, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (invite_hash(code), code, username, sub_url, expires_at, iso_now()),
            )
            conn.commit()
        self.redirect("/invites/")

    def admin_reset_subscription(self) -> None:
        if not self.admin_session():
            self.redirect("/invites/")
            return
        username = self.form().get("username", "").upper()
        if not USER_RE.match(username):
            self.redirect("/invites/?subscription=failed")
            return
        status = reset_bound_account_subscription_url(username)
        self.redirect(f"/invites/?subscription={status}")

    def admin_revoke_invite(self) -> None:
        if not self.admin_session():
            self.redirect("/invites/")
            return
        invite_id = self.form().get("id", "")
        if invite_id.isdigit():
            with db() as conn:
                conn.execute(
                    "UPDATE invites SET disabled = 1, code_plain = NULL WHERE id = ? AND used_at IS NULL",
                    (int(invite_id),),
                )
        self.redirect("/invites/")

    def log_message(self, fmt: str, *args: Any) -> None:
        print("%s - %s" % (self.address_string(), fmt % args), flush=True)


def main() -> int:
    init_db()
    server = ThreadingHTTPServer((LISTEN_HOST, LISTEN_PORT), AccountHandler)
    print(f"umbra-account listening on {LISTEN_HOST}:{LISTEN_PORT}", flush=True)
    server.serve_forever()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
