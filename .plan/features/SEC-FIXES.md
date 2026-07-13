# Security Fixes (Block-0 — Do Before Everything Else)

**These are not features. These are bugs. Fix before any new feature work.**

---

## SEC-01: Password in GET Query Parameter

**Severity:** 🔴 CRITICAL  
**File:** `backend/src/main/java/com/nilachakra/web/rest/AccountResource.java`  
**Problem:** `GET /api/check-credentials?password=<encoded_password>&checkUUID=<uuid>`  
Password appears in: server access logs, nginx/proxy logs, browser URL history, referrer headers.

**Fix:**
```java
// Before: @GetMapping("/check-credentials")
// After:  @PostMapping("/check-credentials")
// Change request params to @RequestBody CheckCredentialsBody body
```
Also update any frontend call that hits this endpoint.

---

## SEC-02: JWT Signing Key Rotates on Restart

**Severity:** 🔴 CRITICAL  
**File:** `backend/src/main/java/com/nilachakra/security/jwt/TokenProvider.java`  
**Problem:** Key generated at startup via `CipherUtil.generateSafeToken()` — every restart logs everyone out.

**Fix:**
1. Add DB column or config parameter: `jwt.signing.key` in `utm_configuration_parameter` table
2. On startup: try to load from DB → if not found, generate and persist
3. Key never regenerates on restart; only rotates on explicit admin action

---

## SEC-03: CORS Wildcard in Production

**Severity:** 🟠 HIGH  
**File:** `backend/src/main/resources/config/application-prod.yml`  
**Problem:** `allowed-origins: '*'`  

**Fix:**
```yaml
# application-prod.yml
cors:
  allowed-origins: "https://app.armorsight.io"  # actual hostname
  allowed-methods: "GET,POST,PUT,DELETE,OPTIONS"
  allowed-headers: "*"
  allow-credentials: true
  max-age: 1800
```
Use environment variable: `CORS_ALLOWED_ORIGINS=${FRONTEND_URL}`

---

## SEC-04: gRPC Insecure TLS

**Severity:** 🔴 CRITICAL  
**File:** `backend/src/main/java/com/nilachakra/config/GrpcConfiguration.java`  
**Problem:** `InsecureTrustManagerFactory.INSTANCE` — backend does zero cert verification against agent-manager  

**Fix:**
1. Generate self-signed CA + server cert for agent-manager
2. Store CA cert in backend config
3. Configure TLS channel with proper `TrustManager`
4. In local-dev: use `local-dev/certs/utm.crt` + generate matching agent-manager cert

---

## 📋 SESSION PROMPT (all security fixes together)

```
I want to fix 4 critical security issues in the ArmorSight SIEM backend. Fix them in order.

Project: /Users/encryptshell/GIT/UTMStack-11/backend/
Tech: Spring Boot 3.3, Java 17

FIX 1 — SEC-01: Password in GET query param
- File: src/main/java/com/nilachakra/web/rest/AccountResource.java
- Find the endpoint with ?password= in a GET request
- Change to POST with @RequestBody
- Find any frontend-v2 code that calls this endpoint and update it too
  (search /frontend-v2/src for "check-credentials")

FIX 2 — SEC-02: JWT key rotation on restart
- File: src/main/java/com/nilachakra/security/jwt/TokenProvider.java  
- Read the file fully first
- Modify: on init, check utm_configuration_parameter table for key named 'jwt.signing.key'
  - If found: use it
  - If not found: generate new key, persist to table, use it
- Use UtmConfigurationParameterService to read/write the parameter

FIX 3 — SEC-03: CORS wildcard
- File: src/main/resources/config/application-prod.yml
- Change allowed-origins from '*' to ${FRONTEND_URL:https://localhost:3000}

FIX 4 — SEC-04: gRPC insecure TLS
- File: src/main/java/com/nilachakra/config/GrpcConfiguration.java
- Read the file fully first
- Replace InsecureTrustManagerFactory with a proper TrustManager
- Load CA cert from: ${GRPC_CA_CERT_PATH:/certs/utm.crt}
- If cert file not found: log warning and fall back to insecure (dev mode only)
- Add GRPC_CA_CERT_PATH to application-dev.yml pointing to local-dev/certs/utm.crt

After each fix: confirm the application still compiles (mvn compile -DskipTests if you can run it).
```
