#!/usr/bin/env python3
import urllib.request, urllib.error, json

BASE = "http://localhost:8088"

def login(user, pwd):
    url = BASE + "/api/authenticate"
    data = json.dumps({"username": user, "password": pwd, "rememberMe": False}).encode()
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(req) as r:
            resp = json.loads(r.read())
            return resp
    except urllib.error.HTTPError as e:
        return {"error": e.code, "msg": e.read().decode()}

# Test all likely passwords
for pwd in ["localdev123!", "admin", "localdev123", "Admin123!"]:
    result = login("admin", pwd)
    if result.get("token"):
        print(f"SUCCESS: admin / {pwd}")
        print(f"Token: {result['token'][:60]}...")
    else:
        print(f"FAIL: admin / {pwd} -> {result.get('msg','')[:80]}")
