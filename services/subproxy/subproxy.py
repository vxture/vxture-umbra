#!/usr/bin/env python3
"""Thin Marzban subscription metadata normalizer.

Public URL format stays Marzban-native: /sub/<token>.
This service does not convert subscription formats. It forwards the request to
Marzban, reads /sub/<token>/info to learn the username, then normalizes the
profile title and download filename to "<prefix>-<username>".
"""

# Runtime image is digest-pinned at deploy time (deploy/scripts/
# 26-pin-image-digests.py), so only services whose image digest changed are
# recreated on deploy. The build pipeline rebuilds only changed images and
# retags the rest, so unchanged services keep their digest and stay running.

from __future__ import annotations

import base64
import json
import os
import re
import ssl
import sys
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


LISTEN_HOST = os.environ.get("SUBPROXY_HOST", "0.0.0.0")
LISTEN_PORT = int(os.environ.get("SUBPROXY_PORT", "8080"))
MARZBAN_BASE_URL = os.environ.get("MARZBAN_BASE_URL", "https://umbra-marzban:8000").rstrip("/")
PROFILE_PREFIX = (os.environ.get("SUB_PROFILE_PREFIX", "Ruyin").strip() or "Ruyin")

TOKEN_PATH_RE = re.compile(r"^/sub/([^/\s]+)$")
HOP_BY_HOP_HEADERS = {
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade",
}


def base64_title(title: str) -> str:
    encoded = base64.b64encode(title.encode("utf-8")).decode("ascii")
    return f"base64:{encoded}"


def safe_filename(title: str) -> str:
    return re.sub(r"[^A-Za-z0-9._-]+", "_", title).strip("._-") or "Ruyin"


def public_subscription_url(source: BaseHTTPRequestHandler) -> str:
    host = source.headers.get("Host", "")
    if not host:
        return source.path
    return f"https://{host}{source.path}"


# Allowlist of client headers forwarded to the internal Marzban /sub endpoint.
# User-Agent is required (Marzban picks the config format from it); the rest are
# standard content-negotiation / caching headers. Everything else a client sends
# (cookies, authorization, x-forwarded-*, custom headers) is dropped.
FORWARD_REQUEST_HEADERS = {
    "accept",
    "accept-language",
    "user-agent",
    "range",
    "if-modified-since",
    "if-none-match",
}


def request_headers(source: BaseHTTPRequestHandler) -> dict[str, str]:
    headers: dict[str, str] = {}
    for key, value in source.headers.items():
        if key.lower() in FORWARD_REQUEST_HEADERS:
            headers[key] = value
    headers["Accept-Encoding"] = "identity"
    return headers


def _build_tls_context() -> ssl.SSLContext:
    """If MARZBAN_CA_CERT points to a CA bundle, verify Marzban's chain against it
    (hostname check left off: the internal cert CN need not match the service
    name); otherwise fall back to an explicit unverified context for the
    self-signed cert reached over the private Docker network."""
    ca = os.environ.get("MARZBAN_CA_CERT", "").strip()
    if ca and os.path.exists(ca):
        ctx = ssl.create_default_context(cafile=ca)
        ctx.check_hostname = False
        return ctx
    return ssl._create_unverified_context()


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    """Refuse redirects: Marzban never legitimately redirects /sub, so following a
    3xx would let a spoofed upstream bounce us to an arbitrary host (SSRF)."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


_OPENER = urllib.request.build_opener(_NoRedirect, urllib.request.HTTPSHandler(context=_build_tls_context()))


def open_url(url: str, headers: dict[str, str], timeout: int = 10):
    request = urllib.request.Request(url, headers=headers, method="GET")
    return _OPENER.open(request, timeout=timeout)


def fetch_username(token: str) -> str | None:
    url = f"{MARZBAN_BASE_URL}/sub/{urllib.parse.quote(token, safe='')}/info"
    headers = {
        "Accept": "application/json",
        "User-Agent": "umbra-subproxy",
        "Accept-Encoding": "identity",
    }

    try:
        with open_url(url, headers, timeout=8) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except Exception:
        return None

    username = payload.get("username")
    if isinstance(username, str) and username:
        return username
    return None


def rewrite_yaml_profile_title(body: bytes, title: str, content_type: str) -> bytes:
    is_yaml = "yaml" in content_type.lower() or body.startswith(b"#profile-title:")
    if not is_yaml:
        return body

    text = body.decode("utf-8", errors="replace")
    lines = text.splitlines(keepends=True)
    if lines and lines[0].startswith("#profile-title:"):
        newline = "\n" if lines[0].endswith("\n") else ""
        lines[0] = f"#profile-title: {title}{newline}"
        return "".join(lines).encode("utf-8")
    return f"#profile-title: {title}\n{text}".encode("utf-8")


class SubProxyHandler(BaseHTTPRequestHandler):
    server_version = "UmbraSubProxy/1.0"

    def do_HEAD(self):
        self.send_response(405)
        self.send_header("allow", "GET")
        self.end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlsplit(self.path)

        if parsed.path == "/health":
            self.send_response(200)
            self.send_header("content-type", "text/plain")
            self.end_headers()
            self.wfile.write(b"ok\n")
            return

        match = TOKEN_PATH_RE.match(parsed.path)
        if not match:
            self.send_response(404)
            self.send_header("content-type", "text/plain")
            self.end_headers()
            self.wfile.write(b"not found\n")
            return

        token = match.group(1)
        username = fetch_username(token)
        title = f"{PROFILE_PREFIX}-{username}" if username else PROFILE_PREFIX

        upstream_url = f"{MARZBAN_BASE_URL}{parsed.path}"
        if parsed.query:
            upstream_url = f"{upstream_url}?{parsed.query}"

        try:
            with open_url(upstream_url, request_headers(self), timeout=15) as response:
                status = response.status
                reason = response.reason
                headers = response.headers
                body = response.read()
        except urllib.error.HTTPError as error:
            status = error.code
            reason = error.reason
            headers = error.headers
            body = error.read()
        except Exception as error:
            self.send_response(502)
            self.send_header("content-type", "text/plain")
            self.end_headers()
            self.wfile.write(f"upstream error: {error}\n".encode("utf-8"))
            return

        content_type = headers.get("content-type", "")
        body = rewrite_yaml_profile_title(body, title, content_type)

        self.send_response(status, reason)
        for key, value in headers.items():
            lower = key.lower()
            if lower in HOP_BY_HOP_HEADERS:
                continue
            if lower in {"content-length", "content-disposition", "profile-title", "profile-web-page-url"}:
                continue
            self.send_header(key, value)

        self.send_header("content-disposition", f"attachment; filename={safe_filename(title)}")
        self.send_header("profile-title", base64_title(title))
        self.send_header("profile-web-page-url", public_subscription_url(self))
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt: str, *args):
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))


def main() -> int:
    server = ThreadingHTTPServer((LISTEN_HOST, LISTEN_PORT), SubProxyHandler)
    print(f"umbra-subproxy listening on {LISTEN_HOST}:{LISTEN_PORT}", flush=True)
    server.serve_forever()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
