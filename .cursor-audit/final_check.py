#!/usr/bin/env python3
"""Full system verification script"""
import urllib.request, urllib.error, json, subprocess, sys

BASE_API = "http://localhost:8088"
BASE_UI  = "http://localhost:8880"

def get(url):
    try:
        with urllib.request.urlopen(url, timeout=10) as r:
            return r.read().decode()
    except Exception as e:
        return f"ERROR: {e}"

def post(url, data, token=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    body = json.dumps(data).encode()
    req = urllib.request.Request(url, data=body, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            rb = r.read()
            return json.loads(rb) if rb.strip() else {"status": r.status}
    except urllib.error.HTTPError as e:
        return {"error": e.code, "body": e.read().decode()}

print("=" * 60)
print("NilaChakra Full System Verification")
print("=" * 60)

# 1. Frontend
print("\n[1] FRONTEND http://localhost:8880")
ui = get(BASE_UI + "/")
checks = {
    "Title: NilaChakra":     "<title>NilaChakra</title>" in ui,
    "No UTMSTACK Technology": "UTMSTACK Technology" not in ui,
    "Welcome to NilaChakra":  "Welcome to NilaChakra" in ui,
}
for k, v in checks.items():
    print(f"    {'✅' if v else '❌'} {k}")

# 2. Backend health
print("\n[2] BACKEND http://localhost:8088")
health = get(BASE_API + "/api/healthcheck")
print(f"    Healthcheck: {'✅ OK' if health.strip('\"% \n') == 'OK' else '❌ ' + health}")

# 3. Login
print("\n[3] LOGIN admin/admin")
login1 = post(BASE_API + "/api/authenticate", {"username": "admin", "password": "admin", "rememberMe": False})
if login1.get("token"):
    print(f"    ✅ Login OK (admin/admin)")
    token = login1["token"]
    # Change to localdev123!
    chg = post(BASE_API + "/api/account/change-password", {"currentPassword": "admin", "newPassword": "localdev123!"}, token=token)
    print(f"    Password change: {'✅ OK' if chg.get('status') == 200 or chg.get('ok') else '⚠️ ' + str(chg)}")
    # Verify new password
    login2 = post(BASE_API + "/api/authenticate", {"username": "admin", "password": "localdev123!", "rememberMe": False})
    if login2.get("token"):
        print(f"    ✅ Login OK (admin/localdev123!)")
    else:
        print(f"    ❌ Login failed with localdev123!: {login2}")
else:
    print(f"    ❌ Login failed: {login1}")

# 4. Database
print("\n[4] DATABASE")
try:
    result = subprocess.run(
        ["docker", "exec", "local-dev-postgres-1", "psql", "-U", "postgres", "-d", "nilachakra", "-t", "-c",
         "SELECT current_database() || ' | nilachakra.*:' || (SELECT count(*) FROM utm_configuration_parameter WHERE conf_param_short LIKE 'nilachakra.%')::text || ' | utmstack.*:' || (SELECT count(*) FROM utm_configuration_parameter WHERE conf_param_short LIKE 'utmstack.%')::text"],
        capture_output=True, text=True, env={"PATH": "/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin"}
    )
    print(f"    ✅ {result.stdout.strip()}")
except Exception as e:
    print(f"    ⚠️ Could not query DB: {e}")

# 5. Container status
print("\n[5] CONTAINERS")
try:
    result = subprocess.run(
        ["docker", "ps", "--format", "{{.Names}}|{{.Status}}|{{.Image}}"],
        capture_output=True, text=True, env={"PATH": "/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin"}
    )
    for line in result.stdout.splitlines():
        if "local-dev" not in line:
            continue
        name, status, image = line.split("|", 2)
        ok = "healthy" in status.lower() or ("up" in status.lower() and "unhealthy" not in status.lower())
        local = "nilachakra/" in image
        print(f"    {'✅' if ok else '⚠️'} {name.strip()} | {status.strip()} | {'🏠 LOCAL' if local else '🌐 ' + image.split('/')[-1]}")
except Exception as e:
    print(f"    ⚠️ {e}")

print("\n" + "=" * 60)
print("Access: http://localhost:8880  |  Login: admin / localdev123!")
print("=" * 60)
