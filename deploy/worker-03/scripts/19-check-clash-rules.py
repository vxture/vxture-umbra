#!/usr/bin/env python3
"""Validate generated Clash subscription routing rules.

This is a source-of-truth guard for must-direct domains such as Microsoft,
Vultr, and Umbra's own public services. The validator fails if any
must-direct domain is missing, forced to PROXY, or placed after the first PROXY
or MATCH rule.
"""
import argparse
import ipaddress
import re
import sys
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[3]
RULE_RE = re.compile(r"^\s*-\s*(DOMAIN|DOMAIN-SUFFIX|IP-CIDR),([^,]+),(DIRECT|PROXY)\b")


def load_env(env_path: Path) -> dict:
    env = {}
    with env_path.open(encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            env[key.strip()] = value.strip()
    return env


def render_placeholders(text: str, variables: dict) -> str:
    def replace(match):
        key = match.group(1).strip()
        return variables.get(key, match.group(0))

    return re.sub(r"\{\{\s*(\w+)\s*\}\}", replace, text)


def load_must_direct_rules(rule_path: Path, variables: dict) -> list[tuple[str, str]]:
    expected = []
    domain_rule_types = {"DOMAIN", "DOMAIN-SUFFIX"}
    ip_rule_types = {"IP-CIDR"}
    with rule_path.open(encoding="utf-8") as f:
        for raw in f:
            line = raw.strip()
            if not line or line.startswith("#"):
                continue
            line = render_placeholders(line, variables)
            parts = [part.strip() for part in line.split(",")]
            if len(parts) != 2:
                raise ValueError(f"Invalid must-direct rule source: {raw.rstrip()}")
            rule_type, value = parts
            if rule_type not in domain_rule_types | ip_rule_types or not value:
                raise ValueError(f"Invalid must-direct rule source: {raw.rstrip()}")
            if rule_type in ip_rule_types:
                try:
                    value = str(ipaddress.ip_network(value, strict=False))
                except ValueError as exc:
                    raise ValueError(f"Invalid must-direct IP/CIDR source: {raw.rstrip()}") from exc
            expected.append((rule_type, value.lower()))
    return expected


def parse_rules(config_path: Path) -> tuple[list[tuple[int, str, str, str]], int | None, int | None]:
    rules = []
    first_proxy = None
    first_match = None

    for idx, line in enumerate(config_path.read_text(encoding="utf-8").splitlines(), start=1):
        match = RULE_RE.match(line)
        if match:
            rule_type, value, policy = match.groups()
            policy = policy.upper()
            rules.append((idx, rule_type, value.lower(), policy))
            if policy == "PROXY" and first_proxy is None:
                first_proxy = idx
            continue

        if re.match(r"^\s*-\s*MATCH,(DIRECT|PROXY)\b", line):
            if first_match is None:
                first_match = idx

    return rules, first_proxy, first_match


def proxy_overlaps_must_direct(proxy_type: str, proxy_value: str, direct_type: str, direct_value: str) -> bool:
    if direct_type == "IP-CIDR":
        if proxy_type != "IP-CIDR":
            return False
        return ipaddress.ip_network(proxy_value, strict=False).overlaps(
            ipaddress.ip_network(direct_value, strict=False)
        )

    if direct_type == "DOMAIN":
        return proxy_type == "DOMAIN" and proxy_value == direct_value

    if proxy_value == direct_value or proxy_value.endswith(f".{direct_value}"):
        return True

    if proxy_type == "DOMAIN-SUFFIX" and direct_value.endswith(f".{proxy_value}"):
        return True

    return False


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True, type=Path)
    parser.add_argument("--env", type=Path, default=None)
    parser.add_argument(
        "--rules",
        type=Path,
        default=PROJECT_ROOT / "configs" / "marzban" / "must-direct-rules.txt",
    )
    args = parser.parse_args()

    env_path = args.env or (PROJECT_ROOT / ".env")
    if not env_path.exists():
        env_path = PROJECT_ROOT / ".env.example"

    variables = load_env(env_path)
    expected = load_must_direct_rules(args.rules, variables)
    actual, first_proxy, first_match = parse_rules(args.config)
    if first_proxy is None or first_match is None:
        print("[FAIL] Clash rules must contain at least one PROXY rule and a final MATCH rule")
        return 1

    direct = {(rule_type, value): line for line, rule_type, value, policy in actual if policy == "DIRECT"}
    proxy_rules = [(line, rule_type, value) for line, rule_type, value, policy in actual if policy == "PROXY"]
    boundary = min(x for x in [first_proxy, first_match] if x is not None)

    failed = False
    for rule_type, value in expected:
        key = (rule_type, value)
        direct_line = direct.get(key)

        if direct_line is None:
            print(f"[FAIL] missing must-direct rule: {rule_type},{value},DIRECT")
            failed = True
        elif direct_line > boundary:
            print(
                f"[FAIL] must-direct rule appears after PROXY/MATCH boundary: "
                f"{rule_type},{value},DIRECT at line {direct_line}"
            )
            failed = True

        for proxy_line, proxy_type, proxy_value in proxy_rules:
            if proxy_overlaps_must_direct(proxy_type, proxy_value, rule_type, value):
                print(
                    f"[FAIL] must-direct domain overlaps PROXY rule at line {proxy_line}: "
                    f"{proxy_type},{proxy_value},PROXY conflicts with {rule_type},{value},DIRECT"
                )
                failed = True

    if failed:
        return 1

    print(f"[OK]   Clash must-direct rules verified: {len(expected)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
