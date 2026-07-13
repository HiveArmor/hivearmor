# S01-T05 — Enable TFA by Default in docker-compose

**Sprint:** 1 (Security-Critical)  
**Severity:** HIGH  
**Issue ID:** SEC-NEW-03  
**Dependencies:** None  
**Estimated time:** 1 hour

---

## Context

`local-dev/docker-compose.yml` ships with `APP_TFA_ENABLED=false`. Any deployment derived from this file (staging, production) silently disables MFA for all users enterprise-wide. `TokenProvider.shouldBypassTfa()` reads this env var; when false, every user bypasses TFA even if enrolled.

**Affected file:** `local-dev/docker-compose.yml` (~line 172)

---

## What to Read First

1. `local-dev/docker-compose.yml` — find the `APP_TFA_ENABLED=false` line and understand the full backend service config
2. `backend/src/main/java/com/nilachakra/security/jwt/TokenProvider.java` — find `shouldBypassTfa()` to understand how the env var is read
3. `backend/src/main/resources/config/application.yml` — confirm what config key maps to the env var

---

## Implementation Steps

### Step 1: Change the docker-compose default

In `local-dev/docker-compose.yml`, find the backend service environment block:

```yaml
# BEFORE:
- APP_TFA_ENABLED=false

# AFTER:
- APP_TFA_ENABLED=true
```

### Step 2: Add a startup warning when TFA is disabled

In `TokenProvider.java`, add a startup check that warns loudly if TFA is disabled in a non-dev profile. Find the constructor or `@PostConstruct` / `afterPropertiesSet()`:

```java
@Component
public class TokenProvider implements InitializingBean {

    @Value("${app.tfa-enabled:true}")
    private boolean tfaEnabled;
    
    @Value("${spring.profiles.active:prod}")
    private String activeProfile;

    private static final Logger log = LoggerFactory.getLogger(TokenProvider.class);

    @Override
    public void afterPropertiesSet() {
        if (!tfaEnabled && !activeProfile.contains("dev") && !activeProfile.contains("test")) {
            log.warn("===========================================================");
            log.warn("SECURITY WARNING: TFA is DISABLED (APP_TFA_ENABLED=false).");
            log.warn("This disables multi-factor authentication for ALL users.");
            log.warn("Set APP_TFA_ENABLED=true for production deployments.");
            log.warn("===========================================================");
        }
    }
}
```

### Step 3: Add a `.env.example` file for production deployments

Create: `local-dev/.env.example`

```bash
# ArmorSight SIEM — Environment variables reference
# Copy this file to .env and fill in production values

# Security
APP_FRONTEND_URL=https://your-armorsight-domain.com
APP_TFA_ENABLED=true
ENCRYPTION_KEY=<generate with: openssl rand -hex 32>
TRUSTED_PROXY_CIDRS=   # e.g., 10.0.0.0/8 if behind internal load balancer

# Database
DB_PASSWORD=<strong-random-password>

# Mail
MAIL_HOST=smtp.yourdomain.com
MAIL_PORT=587
MAIL_USERNAME=alerts@yourdomain.com
MAIL_PASSWORD=<smtp-password>
```

### Step 4: Integration test

Create: `backend/src/test/java/com/nilachakra/security/jwt/TfaEnabledDefaultTest.java`

```java
@SpringBootTest(properties = {"app.tfa-enabled=true"})
class TfaEnabledByDefaultTest {

    @Autowired TokenProvider tokenProvider;

    @Test
    void whenTfaEnabled_shouldBypassTfa_returnsFalse() {
        // TFA is on: shouldBypassTfa must return false (TFA NOT bypassed)
        assertThat(tokenProvider.shouldBypassTfa()).isFalse();
    }
}

@SpringBootTest(properties = {"app.tfa-enabled=false"})
class TfaDisabledTest {

    @Autowired TokenProvider tokenProvider;

    @Test
    void whenTfaDisabled_shouldBypassTfa_returnsTrue() {
        assertThat(tokenProvider.shouldBypassTfa()).isTrue();
    }
}
```

---

## Test Commands

```bash
cd /Users/encryptshell/GIT/UTMStack-11/backend

./mvnw compile -q

./mvnw test -Dtest="*TfaEnabled*,*TfaDisabled*" -DfailIfNoTests=false

# Verify docker-compose change:
grep "APP_TFA_ENABLED" /Users/encryptshell/GIT/UTMStack-11/local-dev/docker-compose.yml
# Must output: APP_TFA_ENABLED=true

# Smoke test with running stack:
# Login should now require TFA for enrolled users
curl -s -X POST http://localhost:8088/api/authenticate \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"localdev123!","rememberMe":false}' | jq '.id_token' 
# If TFA is required for admin, the returned token should be a PRE_VERIFICATION_USER token
# Check the token claims:
# token=$(above command) 
# echo $token | cut -d. -f2 | base64 -d | jq '.auth'
# Should show "ROLE_PRE_VERIFICATION_USER" if TFA is active
```

---

## Acceptance Criteria

- [ ] `APP_TFA_ENABLED=true` in `local-dev/docker-compose.yml`
- [ ] Startup warning logs if TFA is disabled in non-dev profile
- [ ] `backend/src/test/.../TfaEnabledDefaultTest.java` passes
- [ ] `./mvnw compile` succeeds
- [ ] `.env.example` file created with all required environment variables documented

---

## Note for Dev Team

After this change, any developer restarting the local stack will be prompted for TFA on login. Either:
1. Enroll TFA in the running dev instance via `/settings/tfa` 
2. Or temporarily set `APP_TFA_ENABLED=false` in their local `.env` override (document this)

Never commit `APP_TFA_ENABLED=false` back to the shared docker-compose.
