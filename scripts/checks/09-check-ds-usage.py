#!/usr/bin/env python3
"""Design-system usage guardrail for the Umbra portals.

The portals must consume @vxture/design-system completely: DS React components
plus DS token CSS variables (var(--vx-*)). They must NOT hand-build design
primitives (raw colors, local fonts, local --vx-* token definitions) or
duplicate DS component styles (buttons, cards, badges, inputs, ...). When the
DS lacks something, the fix is to extend the DS package (see
docs/design/ds-extension-requests.md), not to self-build in a portal.

This script reports violations. It is intentionally NOT wired into the
quality-gate yet: the current tree still contains the legacy hand-built styles
that the redesign removes. Run it manually to produce the migration inventory:

    python scripts/checks/09-check-ds-usage.py            # report, exit 0
    python scripts/checks/09-check-ds-usage.py --strict   # exit 1 on findings

Once a portal is migrated, add this script (with --strict) to
.github/workflows/ci.yml static-checks so regressions are blocked.

A line may opt out of a single rule with a trailing "ds-allow" comment, e.g.
    color: #fff; /* ds-allow: vendor canvas fallback */
Use sparingly and explain why.
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
PORTALS = ("website", "console", "admin")
SCAN_SUBDIRS = ("app", "components", "lib", "src")
SKIP_DIR_NAMES = {"node_modules", ".next", "dist", "build", "__pycache__"}
ALLOW_MARKER = "ds-allow"

# Raw color literals: hex (3/4/6/8 digits) and rgb()/hsl() function forms.
HEX_COLOR = re.compile(r"#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})(?![0-9a-fA-F])")
FUNC_COLOR = re.compile(r"\b(?:rgba?|hsla?)\(")
# Local definition of a DS token (must come from the DS package).
LOCAL_VX_TOKEN = re.compile(r"(?m)^\s*--vx-[A-Za-z0-9-]+\s*:")
FONT_FACE = re.compile(r"@font-face")
FONT_FAMILY = re.compile(r"\bfont-family\s*:")
NEXT_FONT_IMPORT = re.compile(r"""from\s+["']next/font(?:/google|/local)?["']""")

# Selectors that duplicate DS components; these belong to DS, not portal CSS.
COMPONENT_CLASSES = (
    "btn", "card", "section-card", "metric-card", "metric-label", "metric-value",
    "app-badge", "badge", "input", "code-box", "notice", "admin-card",
    "card-title", "card-desc", "card-link",
)
COMPONENT_CLASS_RE = re.compile(
    r"(?:^|[\s,>+~])\.(?:" + "|".join(re.escape(c) for c in COMPONENT_CLASSES) + r")(?![\w-])"
)

REQUIRED_LAYOUT_IMPORTS = (
    "@vxture/design-system/styles/globals.css",
    "@vxture/design-system/styles/brands/ruyin.css",
)


class Finding:
    __slots__ = ("portal", "path", "line", "rule", "text")

    def __init__(self, portal: str, path: Path, line: int, rule: str, text: str) -> None:
        self.portal = portal
        self.path = path
        self.line = line
        self.rule = rule
        self.text = text


def rel(path: Path) -> str:
    return path.relative_to(PROJECT_ROOT).as_posix()


def iter_files(portal: str):
    base = PROJECT_ROOT / "portals" / portal
    for sub in SCAN_SUBDIRS:
        root = base / sub
        if not root.is_dir():
            continue
        for path in root.rglob("*"):
            if not path.is_file():
                continue
            if any(part in SKIP_DIR_NAMES for part in path.relative_to(PROJECT_ROOT).parts):
                continue
            if path.suffix in (".css", ".ts", ".tsx"):
                yield path


def is_comment(stripped: str) -> bool:
    return stripped.startswith(("/*", "*", "//"))


def selector_opener(stripped: str) -> bool:
    return stripped.endswith("{") or stripped.endswith(",")


def scan_file(portal: str, path: Path, findings: list[Finding]) -> None:
    text = path.read_text(encoding="utf-8", errors="replace")
    is_css = path.suffix == ".css"
    for i, line in enumerate(text.splitlines(), start=1):
        stripped = line.strip()
        if not stripped or is_comment(stripped) or ALLOW_MARKER in line:
            continue

        if HEX_COLOR.search(line) or FUNC_COLOR.search(line):
            findings.append(Finding(portal, path, i, "raw-color", stripped))

        if is_css:
            if LOCAL_VX_TOKEN.search(line):
                findings.append(Finding(portal, path, i, "local-vx-token", stripped))
            if FONT_FACE.search(line):
                findings.append(Finding(portal, path, i, "local-font-face", stripped))
            elif FONT_FAMILY.search(line) and "var(--" not in line:
                findings.append(Finding(portal, path, i, "literal-font-family", stripped))
            if selector_opener(stripped) and COMPONENT_CLASS_RE.search(line):
                findings.append(Finding(portal, path, i, "duplicates-ds-component", stripped))
        else:
            if NEXT_FONT_IMPORT.search(line) and path.name != "layout.tsx":
                findings.append(Finding(portal, path, i, "local-font-import", stripped))


def check_required_imports(portal: str, findings: list[Finding]) -> None:
    layout = PROJECT_ROOT / "portals" / portal / "app" / "layout.tsx"
    if not layout.is_file():
        return
    text = layout.read_text(encoding="utf-8", errors="replace")
    for needle in REQUIRED_LAYOUT_IMPORTS:
        if needle not in text:
            findings.append(
                Finding(portal, layout, 1, "missing-required-import", f"layout must import {needle}")
            )


def main() -> int:
    parser = argparse.ArgumentParser(description="Design-system usage guardrail for Umbra portals.")
    parser.add_argument("--strict", action="store_true", help="exit 1 when findings exist")
    args = parser.parse_args()

    findings: list[Finding] = []
    for portal in PORTALS:
        check_required_imports(portal, findings)
        for path in iter_files(portal):
            scan_file(portal, path, findings)

    if not findings:
        print("[ OK ] portals consume the design system without self-built primitives")
        return 0

    by_rule: dict[str, list[Finding]] = {}
    by_portal: dict[str, int] = {p: 0 for p in PORTALS}
    for f in findings:
        by_rule.setdefault(f.rule, []).append(f)
        by_portal[f.portal] = by_portal.get(f.portal, 0) + 1

    for rule in sorted(by_rule):
        items = by_rule[rule]
        print(f"[{rule}] {len(items)} finding(s)")
        for f in items:
            print(f"  {rel(f.path)}:{f.line}: {f.text}")
        print("")

    print("Summary by portal:")
    for portal in PORTALS:
        print(f"  {portal}: {by_portal[portal]}")
    print(f"Total findings: {len(findings)}")

    if args.strict:
        print("[FAIL] design-system usage guardrail found violations")
        return 1
    print("[note] report-only mode; pass --strict to fail on findings")
    return 0


if __name__ == "__main__":
    sys.exit(main())
