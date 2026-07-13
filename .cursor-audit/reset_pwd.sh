#!/bin/bash
export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin"

# Step 1: Get token
RESPONSE=$(curl -s -X POST http://localhost:8088/api/authenticate \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin","rememberMe":false}')

echo "LOGIN RESPONSE: $RESPONSE" > /Users/encryptshell/GIT/UTMStack-11/.cursor-audit/reset_result.txt

TOKEN=$(echo "$RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('token',''))")
echo "TOKEN: ${TOKEN:0:50}..." >> /Users/encryptshell/GIT/UTMStack-11/.cursor-audit/reset_result.txt

if [ -z "$TOKEN" ]; then
  echo "ERROR: Could not get token" >> /Users/encryptshell/GIT/UTMStack-11/.cursor-audit/reset_result.txt
  exit 1
fi

# Step 2: Change password to localdev123!
CHANGE=$(curl -s -X POST http://localhost:8088/api/account/change-password \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"currentPassword":"admin","newPassword":"localdev123!"}')

echo "CHANGE PWD RESPONSE: $CHANGE" >> /Users/encryptshell/GIT/UTMStack-11/.cursor-audit/reset_result.txt

# Step 3: Verify new password works
VERIFY=$(curl -s -X POST http://localhost:8088/api/authenticate \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"localdev123!","rememberMe":false}')

echo "VERIFY LOGIN: $VERIFY" >> /Users/encryptshell/GIT/UTMStack-11/.cursor-audit/reset_result.txt
