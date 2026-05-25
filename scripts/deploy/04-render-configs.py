#!/usr/bin/env python3
"""
Render all configuration templates from configs/ into DATA_DIR.

Template syntax: {{ VARIABLE_NAME }}
Variables sourced from: .env + DATA_DIR/private/reality.json
"""
import json
import ipaddress
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

TEXT_ASSET_SUFFIXES = {
    ".conf",
    ".css",
    ".html",
    ".htm",
    ".js",
    ".json",
    ".map",
    ".md",
    ".svg",
    ".template",
    ".txt",
    ".xml",
    ".yaml",
    ".yml",
}

# ── Paths ─────────────────────────────────────────────────────────────────────
SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent.parent


def load_env(env_path: Path) -> dict:
    env = {}
    with open(env_path) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if "=" in line:
                key, _, val = line.partition("=")
                env[key.strip()] = val.strip()
    return env


def load_reality(reality_path: Path) -> dict:
    if not reality_path.exists():
        print(f"[ERROR] reality.json not found: {reality_path}", file=sys.stderr)
        print("        Run 02-generate-reality.sh first.", file=sys.stderr)
        sys.exit(1)
    with open(reality_path) as f:
        return json.load(f)


def render(template_text: str, variables: dict) -> str:
    def replacer(match):
        key = match.group(1).strip()
        if key not in variables:
            # Only warn for SCREAMING_SNAKE_CASE — those are our env vars.
            # Lowercase/mixed tokens are Jinja2 variables for second-stage renderers.
            if key == key.upper():
                print(f"[WARN] Template variable not found: {{{{{key}}}}}", file=sys.stderr)
            return match.group(0)
        return variables[key]
    return re.sub(r"\{\{\s*(\w+)\s*\}\}", replacer, template_text)


def render_clash_rule_lines(src: Path, variables: dict, policy: str) -> str:
    lines = []
    domain_rule_types = {"DOMAIN", "DOMAIN-SUFFIX"}
    ip_rule_types = {"IP-CIDR"}
    for raw in src.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        rendered = render(line, variables)
        parts = [part.strip() for part in rendered.split(",")]
        if len(parts) != 2:
            print(f"[ERROR] Invalid Clash rule source line: {raw}", file=sys.stderr)
            sys.exit(1)
        rule_type, value = parts
        if rule_type not in domain_rule_types | ip_rule_types or not value:
            print(f"[ERROR] Invalid Clash direct rule: {raw}", file=sys.stderr)
            sys.exit(1)
        if rule_type in ip_rule_types:
            try:
                ipaddress.ip_network(value, strict=False)
            except ValueError:
                print(f"[ERROR] Invalid Clash IP/CIDR direct rule: {raw}", file=sys.stderr)
                sys.exit(1)
            lines.append(f"  - {rule_type},{value},{policy},no-resolve")
        else:
            lines.append(f"  - {rule_type},{value},{policy}")
    return "\n".join(lines)


def render_file(src: Path, dst: Path, variables: dict, mode: int = 0o644):
    dst.parent.mkdir(parents=True, exist_ok=True)
    text = src.read_text(encoding="utf-8")
    rendered = render(text, variables)
    dst.write_text(rendered, encoding="utf-8")
    os.chmod(dst, mode)
    print(f"[OK]   {src.name}  →  {dst}")


def copy_file(src: Path, dst: Path, mode: int = 0o644):
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dst)
    os.chmod(dst, mode)
    print(f"[COPY] {src.name}  →  {dst}")


# ── Static file rendering ─────────────────────────────────────────────────────
def render_static_tree(src_dir: Path, dst_dir: Path, variables: dict):
    for src in sorted(src_dir.rglob("*")):
        if src.is_dir():
            continue
        rel = src.relative_to(src_dir)
        dst = dst_dir / rel
        if src.suffix.lower() in TEXT_ASSET_SUFFIXES:
            render_file(src, dst, variables)
        else:
            copy_file(src, dst)


# ── Load variables ─────────────────────────────────────────────────────────────
env_file = PROJECT_ROOT / ".env"
if not env_file.exists():
    print(f"[ERROR] .env not found at {env_file}", file=sys.stderr)
    sys.exit(1)

env = load_env(env_file)
DATA_DIR = Path(env.get("DATA_DIR", ""))
REPO_DIR = Path(env.get("REPO_DIR", str(PROJECT_ROOT)))

if not DATA_DIR:
    print("[ERROR] DATA_DIR not set in .env", file=sys.stderr)
    sys.exit(1)

reality = load_reality(DATA_DIR / "private" / "reality.json")

# Support both old single short_id and new short_ids array
_short_ids = reality.get("short_ids") or [reality.get("short_id", "")]
_short_ids_json = ", ".join(f'"{s}"' for s in _short_ids)

# Build complete variable map
variables = {
    **env,
    "REALITY_PRIVATE_KEY": reality["private_key"],
    "REALITY_PUBLIC_KEY":  reality["public_key"],
    "REALITY_SHORT_ID":    _short_ids[0],
    "REALITY_SHORT_IDS":   _short_ids_json,
}

configs_dir = REPO_DIR / "configs"
variables["CLASH_MUST_DIRECT_RULES"] = render_clash_rule_lines(
    configs_dir / "marzban" / "must-direct-rules.txt",
    variables,
    "DIRECT",
)

print("\n── Rendering Nginx stream config ────────────────────────────────────────")
render_file(
    configs_dir / "nginx" / "stream.conf.template",
    DATA_DIR / "nginx" / "stream.d" / "stream.conf",
    variables,
)

print("\n── Rendering Nginx virtual host configs ─────────────────────────────────")
vhosts_src = configs_dir / "nginx" / "vhosts"
vhosts_dst = DATA_DIR / "nginx" / "conf.d"
for tmpl in sorted(vhosts_src.glob("*.conf.template")):
    out_name = tmpl.name.replace(".template", "")
    render_file(tmpl, vhosts_dst / out_name, variables)

print("\n── Copying Nginx snippets ────────────────────────────────────────────────")
snippets_src = configs_dir / "nginx" / "snippets"
snippets_dst = DATA_DIR / "nginx" / "snippets"
for snippet in snippets_src.glob("*.conf"):
    copy_file(snippet, snippets_dst / snippet.name)

print("\n── Copying Nginx nginx.conf ──────────────────────────────────────────────")
nginx_conf_src = configs_dir / "nginx" / "nginx.conf"
nginx_conf_dst = DATA_DIR / "nginx" / "nginx.conf"
if nginx_conf_src.exists():
    copy_file(nginx_conf_src, nginx_conf_dst)

print("\n── Rendering Xray config (for Marzban) ──────────────────────────────────")
render_file(
    configs_dir / "xray" / "config.json.template",
    DATA_DIR / "marzban" / "xray_config.json",
    variables,
    mode=0o600,
)

print("\n── Rendering Marzban Clash subscription template ────────────────────────")
render_file(
    configs_dir / "marzban" / "clash-subscription.j2",
    DATA_DIR / "marzban" / "templates" / "clash" / "default.yml",
    variables,
)
subprocess.run(
    [
        sys.executable,
        str(SCRIPT_DIR / "07-validate-clash-rules.py"),
        "--config",
        str(DATA_DIR / "marzban" / "templates" / "clash" / "default.yml"),
        "--env",
        str(env_file),
    ],
    check=True,
)

print("\n── Rendering VPN portal ─────────────────────────────────────────────────")
portal_src = REPO_DIR / "portal" / "html"
portal_dst = DATA_DIR / "portal" / "html"
if portal_src.exists():
    render_static_tree(portal_src, portal_dst, variables)
else:
    print(f"[WARN] portal/html/ not found in repo — skipping")

print("\n── Rendering landing page ───────────────────────────────────────────────")
landing_src = REPO_DIR / "landing" / "html"
if landing_src.exists():
    for dst_dir in [DATA_DIR / "nginx" / "html" / "ruyin-landing",
                    DATA_DIR / "nginx" / "html" / "www-ruyin"]:
        render_static_tree(landing_src, dst_dir, variables)
else:
    print(f"[WARN] landing/html/ not found in repo — skipping")

print("\n── Copying docs placeholder ─────────────────────────────────────────────")
docs_src = REPO_DIR / "docs-site" / "html"
docs_dst = DATA_DIR / "docs" / "site"
if docs_src.exists():
    for f in docs_src.iterdir():
        copy_file(f, docs_dst / f.name)
else:
    # Create minimal placeholder
    placeholder = docs_dst / "index.html"
    docs_dst.mkdir(parents=True, exist_ok=True)
    if not placeholder.exists():
        placeholder.write_text("<html><body><h1>Umbra Docs</h1><p>Coming soon.</p></body></html>")
        print(f"[INIT] Created docs placeholder at {placeholder}")

print("\n── All configs rendered ─────────────────────────────────────────────────\n")
