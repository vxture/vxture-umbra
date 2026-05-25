#!/usr/bin/env python3
"""Static checks for high-risk deployment script contracts.

This is not a shell parser. It verifies concrete safety guardrails that have
caused incidents before and are documented in docs/deployment/checklists.md.
"""
from __future__ import annotations

import sys
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[2]


CHECKS: list[tuple[str, Path, list[str]]] = [
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
            'find "$BACKUP_DIR" -type f',
            "-print0",
            "read -r -d ''",
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
]


FORBIDDEN: list[tuple[str, Path, str]] = [
    (
        "renewal must not hide nginx -t stderr",
        Path("scripts/ops/certs.sh"),
        'nginx -t >/dev/null 2>&1',
    ),
    (
        "retired subscription domain must not remain hard-coded",
        Path("."),
        "sub" + ".ruyin.ai",
    ),
]


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def iter_text_files(root: Path):
    for path in root.rglob("*"):
        if not path.is_file():
            continue
        if ".git" in path.parts or "__pycache__" in path.parts:
            continue
        if path.suffix.lower() in {".pyc", ".png", ".jpg", ".jpeg", ".gif", ".ico"}:
            continue
        yield path


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

    for label, rel_path, needle in FORBIDDEN:
        paths = [PROJECT_ROOT / rel_path] if rel_path != Path(".") else list(iter_text_files(PROJECT_ROOT))
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
