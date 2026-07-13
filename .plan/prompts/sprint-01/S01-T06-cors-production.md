# S01-T06 — Fix CORS Wildcard in Production Config

**Sprint:** 1 (Security-Critical)  
**Severity:** HIGH  
**Issue ID:** SEC-03  
**Dependencies:** S01-T02 (APP_FRONTEND_URL must be defined first)  
**Estimated time:** 1 hour

---

## Context

`application-prod.yml` has `allowed-origins: '*'`. This allows any website to make cross-origin API calls on behalf of a logged-in user. Combined with any XSS vulnerability, this enables cross-site request forgery attacks against the entire ArmorSight API.

**Affected files:**
- `backend/src/main/resources/config/application-prod.yml` (line ~50-56)
- `backend/src/main/resources/config/application-dev.yml` (line ~60)

---

## What to Read First

1. `backend/src/main/resources/config/application-prod.yml` — find the `jhipster.cors` block
2. `backend/src/main/resources/config/application-dev.yml` — find the same block
3. `backend/src/main/resources/config/application.yml` — check for shared CORS config

---

## Implementation Steps

### Step 1: Fix `application-prod.yml`

```yaml
# BEFORE:
jhipster:
    cors:
        allowed-origins: '*'
        allowed-methods: '*'
        allowed-headers: '*'
        exposed-headers: 'Authorization,Link,X-Total-Count,X-${jhipster.clientApp.name}-alert,X-${jhipster.clientApp.name}-error,X-${jhipster.clientApp.name}-params'
        allow-credentials: false
        max-age: 1800

# AFTER:
jhipster:
    cors:
        allowed-origins: ${APP_FRONTEND_URL:https://localhost:4200}
        allowed-origin-patterns: ''
        allowed-methods: 'GET,POST,PUT,DELETE,PATCH,OPTIONS'
        allowed-headers: 'Authorization,Content-Type,X-Requested-With,Accept,Origin,Cache-Control'
        exposed-headers: 'Authorization,Link,X-Total-Count,X-${jhipster.clientApp.name}-alert,X-${jhipster.clientApp.name}-error,X-${jhipster.clientApp.name}-params'
        allow-credentials: false
        max-age: 1800
```

### Step 2: Fix `application-dev.yml`

```yaml
# Dev stays permissive but explicit:
jhipster:
    cors:
        allowed-origins: 'http://localhost:3000,http://localhost:4200,http://127.0.0.1:3000'
        allowed-methods: 'GET,POST,PUT,DELETE,PATCH,OPTIONS'
        allowed-headers: '*'
        exposed-headers: 'Authorization,Link,X-Total-Count'
        allow-credentials: false
        max-age: 1800
```

### Step 3: Verify CORS filter is using JHipster properties

Read: `backend/src/main/java/com/nilachakra/config/WebConfigurer.java`

Look for the `corsFilter()` bean. Confirm it reads from `jHipsterProperties.getCors()`. If it does, no Java change is needed — the YAML change propagates automatically.

### Step 4: Integration test

Create: `backend/src/test/java/com/nilachakra/config/CorsConfigTest.java`

```java
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = {"app.frontend-url=https://allowed.example.com",
                  "jhipster.cors.allowed-origins=https://allowed.example.com"})
@AutoConfigureMockMvc
class CorsConfigTest {

    @Autowired MockMvc mvc;

    @Test
    void corsRequest_fromAllowedOrigin_hasCorrectHeaders() throws Exception {
        mvc.perform(options("/api/authenticate")
                .header("Origin", "https://allowed.example.com")
                .header("Access-Control-Request-Method", "POST"))
            .andExpect(header().string("Access-Control-Allow-Origin", "https://allowed.example.com"))
            .andExpect(header().exists("Access-Control-Allow-Methods"));
    }

    @Test
    void corsRequest_fromUnknownOrigin_isRejected() throws Exception {
        mvc.perform(options("/api/authenticate")
                .header("Origin", "https://evil.attacker.com")
                .header("Access-Control-Request-Method", "POST"))
            .andExpect(header().doesNotExist("Access-Control-Allow-Origin"));
    }
}
```

---

## Test Commands

```bash
cd /Users/encryptshell/GIT/UTMStack-11/backend

./mvnw compile -q

./mvnw test -Dtest=CorsConfigTest -DfailIfNoTests=false

# Manual CORS test against running backend:
# Allowed origin — should get CORS headers
curl -v -X OPTIONS http://localhost:8088/api/authenticate \
  -H "Origin: http://localhost:3000" \
  -H "Access-Control-Request-Method: POST" 2>&1 | grep -i "access-control"

# Blocked origin — should NOT get allow-origin header
curl -v -X OPTIONS http://localhost:8088/api/authenticate \
  -H "Origin: https://evil.attacker.com" \
  -H "Access-Control-Request-Method: POST" 2>&1 | grep -i "access-control"
```

---

## Acceptance Criteria

- [ ] `application-prod.yml` no longer has `allowed-origins: '*'`
- [ ] Allowed origin is read from `APP_FRONTEND_URL` environment variable
- [ ] `application-dev.yml` allows only `localhost:3000` and `localhost:4200`
- [ ] CORS integration test passes
- [ ] OPTIONS request from legitimate dev origin receives correct CORS headers
- [ ] OPTIONS request from unknown origin does NOT receive `Access-Control-Allow-Origin`
