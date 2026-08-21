#!/usr/bin/env python3
"""Verify staging-vm SCA/SBOM without printing secrets or JWTs."""
from __future__ import annotations

import json
import ssl
import sys
import urllib.error
import urllib.request
from pathlib import Path

BASE = "https://127.0.0.1"
CTX = ssl._create_unverified_context()


def read_kv(path: Path, prefix: str) -> str:
    for line in path.read_text().splitlines():
        if line.startswith(prefix):
            return line.split("=", 1)[1].strip().strip("\"'")
    raise SystemExit(f"missing {prefix}")


def load_admin_password() -> str:
    text = Path("/home/ubuntu/HiveArmor-v1/deploy/staging/ADMIN_BOOTSTRAP.txt").read_text()
    for line in text.splitlines():
        lower = line.lower()
        if "password" in lower and ":" in line:
            return line.split(":", 1)[1].strip()
    raise SystemExit("admin password not found")


def req(method: str, path: str, token: str | None = None, body: dict | None = None, extra: dict | None = None):
    data = None if body is None else json.dumps(body).encode()
    headers = {"Content-Type": "application/json", "Accept": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
        headers["X-Tenant-ID"] = "1"
    if extra:
        headers.update(extra)
    r = urllib.request.Request(BASE + path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(r, context=CTX, timeout=60) as resp:
            raw = resp.read()
            total = resp.headers.get("X-Total-Count")
            payload = json.loads(raw.decode() or "null")
            return resp.status, total, payload
    except urllib.error.HTTPError as e:
        return e.code, None, e.read()[:200].decode(errors="replace")


def main() -> int:
    password = load_admin_password()
    status, _, auth = req("POST", "/api/authenticate", body={
        "username": "admin",
        "password": password,
        "rememberMe": False,
    })
    if status != 200 or not isinstance(auth, dict):
        print(f"auth_status={status}")
        return 1
    token = auth.get("id_token") or auth.get("token")
    if not token:
        print("auth_no_token")
        return 1

    s, total, body = req("GET", "/api/ha-cis/results?agentId=staging-vm&size=20", token)
    print(f"cis_status={s} x_total_count={total}")
    if isinstance(body, list):
        print(f"cis_rows={len(body)}")
        for row in body:
            if not isinstance(row, dict):
                continue
            print(
                "cis",
                row.get("checkId") or row.get("check_id"),
                row.get("status"),
                row.get("packId") or row.get("pack_id"),
                row.get("agentId") or row.get("agent_id"),
            )
    else:
        print(f"cis_body_type={type(body).__name__}")

    s, total, body = req("GET", "/api/ha-cis/catalog", token)
    print(f"catalog_status={s}")
    if isinstance(body, list):
        packs = [r.get("packId") or r.get("pack_id") for r in body if isinstance(r, dict)]
        print(f"catalog_packs={packs}")

    s, total, body = req("GET", "/api/ha-vuln/findings?agentId=staging-vm&size=5", token)
    print(f"vuln_status={s} x_total_count={total}")
    if isinstance(body, list):
        print(f"vuln_rows={len(body)}")
        for row in body[:3]:
            if isinstance(row, dict):
                print("vuln", row.get("cveId") or row.get("cve_id"), row.get("packageName") or row.get("package_name"))

    return 0


if __name__ == "__main__":
    sys.exit(main())
