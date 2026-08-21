#!/usr/bin/env python3
"""Check staging admin login using ADMIN_BOOTSTRAP. Never prints the password."""
from __future__ import annotations

import json
import re
import ssl
import urllib.error
import urllib.request
from pathlib import Path

BOOTSTRAP = Path("/home/ubuntu/HiveArmor-v1/deploy/staging/ADMIN_BOOTSTRAP.txt")


def main() -> int:
    text = BOOTSTRAP.read_text(encoding="utf-8")
    user = "admin"
    pw = None
    for line in text.splitlines():
        s = line.strip()
        if not s or s.startswith("#"):
            continue
        low = s.lower()
        if low.startswith("password") and ("=" in s or ":" in s):
            pw = re.split(r"[:=]", s, 1)[1].strip().strip("\"'")
        if low.startswith("username") or low.startswith("user=") or low.startswith("user:"):
            user = re.split(r"[:=]", s, 1)[1].strip().strip("\"'")
    if pw is None:
        lines = [ln.strip() for ln in text.splitlines() if ln.strip() and not ln.strip().startswith("#")]
        print("parse_failed", "lines", len(lines))
        for i, ln in enumerate(lines[:8]):
            print("line_len", i, len(ln))
        return 2

    body = json.dumps({"username": user, "password": pw, "rememberMe": False}).encode()
    ctx = ssl._create_unverified_context()
    req = urllib.request.Request(
        "https://127.0.0.1/api/authenticate",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, context=ctx, timeout=20) as resp:
            data = json.load(resp)
            tok = data.get("id_token") or data.get("token")
            print("login_status", resp.status)
            print("user", user)
            print("pw_len", len(pw))
            print("token_present", bool(tok))
            return 0
    except urllib.error.HTTPError as exc:
        print("login_http", exc.code)
        print("user", user)
        print("pw_len", len(pw))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
