#!/usr/bin/env python3
import urllib.request
import urllib.error
import json

BASE = "http://localhost:8088"
OUT = "/Users/encryptshell/GIT/UTMStack-11/.cursor-audit/reset_result.txt"

def api(method, path, data=None, token=None):
    url = BASE + path
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    body = json.dumps(data).encode() if data else None
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as r:
            body = r.read()
            return json.loads(body) if body.strip() else {"status": r.status, "ok": True}
    except urllib.error.HTTPError as e:
        return {"error": e.code, "msg": e.read().decode()}

lines = []

# Step 1: login with admin/admin
resp = api("POST", "/api/authenticate", {"username": "admin", "password": "admin", "rememberMe": False})
lines.append(f"LOGIN: {resp}")
token = resp.get("token", "")

if not token:
    lines.append("ERROR: no token received")
else:
    lines.append(f"TOKEN OK: {token[:40]}...")

    # Step 2: change password
    chg = api("POST", "/api/account/change-password",
              {"currentPassword": "admin", "newPassword": "localdev123!"},
              token=token)
    lines.append(f"CHANGE PWD: {chg}")

    # Step 3: verify new password
    v = api("POST", "/api/authenticate", {"username": "admin", "password": "localdev123!", "rememberMe": False})
    lines.append(f"VERIFY localdev123!: {v}")
    if v.get("token"):
        lines.append("SUCCESS: login with localdev123! works")
    else:
        lines.append("FAIL: localdev123! login failed")

with open(OUT, "w") as f:
    f.write("\n".join(lines) + "\n")

print("\n".join(lines))
