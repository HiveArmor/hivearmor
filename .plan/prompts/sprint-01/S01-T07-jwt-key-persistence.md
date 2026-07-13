# S01-T07 — Persist JWT Signing Key Across Restarts

**Sprint:** 1 (Security-Critical)  
**Severity:** HIGH  
**Issue ID:** SEC-02  
**Dependencies:** None  
**Estimated time:** 2 hours

---

## Context

`TokenProvider.java` initializes the JWT signing key as a static field using `CipherUtil.generateSafeToken()`. This generates a **new random key every JVM startup**. Every container restart or redeploy invalidates all active user sessions, forcing re-login. In a zero-downtime deployment with rolling restarts, multiple pods will have different keys, causing random 401 errors.

**Vulnerable file:**
`backend/src/main/java/com/nilachakra/security/jwt/TokenProvider.java`

**Vulnerable code (~line 30):**
```java
private static final String SECRET = CipherUtil.generateSafeToken();
```

---

## What to Read First

1. `backend/src/main/java/com/nilachakra/security/jwt/TokenProvider.java` — entire file
2. `backend/src/main/resources/config/application.yml` — find the `jhipster.security.authentication.jwt` config
3. `backend/src/main/resources/config/application-prod.yml` — same block
4. `local-dev/docker-compose.yml` — find existing ENCRYPTION_KEY usage if any

---

## Implementation Steps

### Step 1: Read the JHipster JWT config key

JHipster already has a standard config path: `jhipster.security.authentication.jwt.base64-secret`. Check if this is already present in `application.yml`. If it is, the fix is straightforward — just use it instead of the static field.

In `TokenProvider.java`, inject the key from config:

```java
@Component
public class TokenProvider {

    private static final Logger log = LoggerFactory.getLogger(TokenProvider.class);

    @Value("${jhipster.security.authentication.jwt.base64-secret:}")
    private String base64JwtSecret;

    @Value("${jhipster.security.authentication.jwt.token-validity-in-seconds:86400}")
    private long tokenValidityInSeconds;

    private Key key;

    @PostConstruct
    public void init() {
        if (!StringUtils.hasText(base64JwtSecret)) {
            throw new IllegalStateException(
                "JWT signing key is not configured. " +
                "Set ENCRYPTION_KEY environment variable or " +
                "jhipster.security.authentication.jwt.base64-secret in application.yml. " +
                "Generate a key with: openssl rand -base64 64"
            );
        }
        byte[] keyBytes = Decoders.BASE64.decode(base64JwtSecret);
        this.key = Keys.hmacShaKeyFor(keyBytes);
        log.info("JWT signing key loaded from configuration (length: {} bytes)", keyBytes.length);
        
        // Remove: private static final String SECRET = CipherUtil.generateSafeToken();
    }
}
```

### Step 2: Update configuration files

In `application.yml`, add the JWT config block if not present:
```yaml
jhipster:
  security:
    authentication:
      jwt:
        base64-secret: ${ENCRYPTION_KEY:}  # Must be set; empty = startup failure
        token-validity-in-seconds: 86400
        token-validity-in-seconds-for-remember-me: 2592000
```

In `application-prod.yml`, ensure it reads from env:
```yaml
jhipster:
  security:
    authentication:
      jwt:
        base64-secret: ${ENCRYPTION_KEY}  # No default — must be set in production
```

In `application-dev.yml`, set a fixed dev key:
```yaml
jhipster:
  security:
    authentication:
      jwt:
        # Dev key only — NEVER use in production
        base64-secret: ZjY4MDYwNWU0ZTQ3MGFkMjJiY2IzYjMyNzAyMGE5NzMxMjdhY2JhMmQ5MDg5MzVjMmJhMTZlY2I5ZjE0NDZiNg==
```

To generate a production key:
```bash
openssl rand -base64 64
```

### Step 3: Update docker-compose

In `local-dev/docker-compose.yml`, add to backend service environment:
```yaml
- ENCRYPTION_KEY=ZjY4MDYwNWU0ZTQ3MGFkMjJiY2IzYjMyNzAyMGE5NzMxMjdhY2JhMmQ5MDg5MzVjMmJhMTZlY2I5ZjE0NDZiNg==
```
(Use the same dev key from application-dev.yml for consistency)

### Step 4: Remove the old static field

After the above changes compile, delete from `TokenProvider.java`:
```java
// DELETE THIS:
private static final String SECRET = CipherUtil.generateSafeToken();
```

### Step 5: Unit test

Create: `backend/src/test/java/com/nilachakra/security/jwt/TokenProviderPersistenceTest.java`

```java
@SpringBootTest(properties = {
    "jhipster.security.authentication.jwt.base64-secret=ZjY4MDYwNWU0ZTQ3MGFkMjJiY2IzYjMyNzAyMGE5NzMxMjdhY2JhMmQ5MDg5MzVjMmJhMTZlY2I5ZjE0NDZiNg=="
})
class TokenProviderPersistenceTest {

    @Autowired TokenProvider tokenProvider;
    @Autowired AuthenticationManager authenticationManager;

    @Test
    void tokenCreatedWithFixedKey_isVerifiableByAnotherInstance() {
        // Create a token
        Authentication auth = new UsernamePasswordAuthenticationToken("testuser", null,
            List.of(new SimpleGrantedAuthority("ROLE_USER")));
        String token = tokenProvider.createToken(auth, false);
        assertThat(token).isNotBlank();

        // Verify the same token provider can validate it
        assertThat(tokenProvider.validateToken(token)).isTrue();

        // Create second instance with the SAME key
        TokenProvider second = new TokenProvider();
        // inject same key via reflection or config
        // validate: token created by first instance must be valid for second
        assertThat(second.validateToken(token)).isTrue();
    }

    @Test
    void missingEncryptionKey_throwsOnStartup() {
        // Verify the @PostConstruct throws on missing key
        assertThatThrownBy(() -> {
            TokenProvider tp = new TokenProvider();
            tp.init();  // base64JwtSecret is empty
        }).isInstanceOf(IllegalStateException.class)
          .hasMessageContaining("JWT signing key is not configured");
    }
}
```

---

## Test Commands

```bash
cd /Users/encryptshell/GIT/UTMStack-11/backend

./mvnw compile -q

./mvnw test -Dtest=TokenProviderPersistenceTest -DfailIfNoTests=false

# Verify key is missing without env var (should fail):
ENCRYPTION_KEY="" ./mvnw spring-boot:run
# Backend should refuse to start with a clear error message

# Verify key works:
ENCRYPTION_KEY=ZjY4MDYwNWU0ZTQ3MGFkMjJiY2IzYjMyNzAyMGE5NzMxMjdhY2JhMmQ5MDg5MzVjMmJhMTZlY2I5ZjE0NDZiNg== \
  ./mvnw spring-boot:run &
# Login, get token, restart backend with SAME key, verify token still works
```

---

## Acceptance Criteria

- [ ] `private static final String SECRET = CipherUtil.generateSafeToken()` is removed
- [ ] JWT signing key is loaded from `ENCRYPTION_KEY` environment variable
- [ ] Backend refuses to start if `ENCRYPTION_KEY` is not set (non-dev profiles)
- [ ] The same token works before and after a backend restart (with the same key)
- [ ] `./mvnw compile` succeeds
- [ ] Unit tests pass
- [ ] `application-dev.yml` has a fixed dev key committed (not random)
- [ ] Production key generation command is documented in `.env.example`
