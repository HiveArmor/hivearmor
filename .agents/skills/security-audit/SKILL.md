---
name: security-audit
description: Java security audit — OWASP Top 10, injection prevention, authentication, secrets management, input validation, Spring Security. Triggered by "security review", "check OWASP", "find vulnerabilities", "security audit".
---

# Security Audit Skill — Java / Spring Boot

Systematic security review targeting HiveArmor's backend.

## Quick Scan Commands

```bash
# Find SQL/OpenSearch injection candidates
grep -rn "\"SELECT\|\"INSERT\|\"UPDATE\|\"DELETE" backend/src/main/java/ | \
  grep "\" +" | grep -v "//\|test"

# Find potential secret exposure in logs
grep -rn "log\.\(info\|debug\|warn\|error\)" backend/src/main/java/ | \
  grep -i "password\|token\|secret\|key"

# Find hardcoded credentials
grep -rn "password\s*=\s*\"\|secret\s*=\s*\"" backend/src/main/java/ | grep -v "test\|Test"

# Find missing @PreAuthorize on REST endpoints
grep -rn "@GetMapping\|@PostMapping\|@PutMapping\|@DeleteMapping" \
  backend/src/main/java/com/hivearmor/web/rest/ | \
  grep -v "@PreAuthorize\|//\|test"

# Find endpoints without rate limiting (public-facing)
grep -rn "permitAll\|isAnonymous" \
  backend/src/main/java/com/hivearmor/config/SecurityConfiguration.java
```

---

## OWASP Top 10 Checklist (Java)

### A01 — Broken Access Control
```java
// ❌ Missing authorization on endpoint
@GetMapping("/api/ha-users/{id}")
public ResponseEntity<UserDTO> getUser(@PathVariable Long id) { ... }

// ✅ Authorized — user can only access own record unless admin
@GetMapping("/api/ha-users/{id}")
@PreAuthorize("hasRole('ADMIN') or #id == authentication.principal.id")
public ResponseEntity<UserDTO> getUser(@PathVariable Long id) { ... }

// ✅ Or check in SecurityConfiguration for bulk path rules
.requestMatchers("/api/ha-admin/**").hasRole("ADMIN")
```

### A02 — Cryptographic Failures
```java
// ❌ MD5/SHA1 without salt for passwords
MessageDigest.getInstance("MD5").digest(password.getBytes())

// ✅ BCrypt (Spring Security default) or Argon2
@Bean
public PasswordEncoder passwordEncoder() {
    return new BCryptPasswordEncoder(12);  // cost factor 12
}

// ❌ Weak JWT secret
@Value("${jwt.secret:default-secret}")  // fallback to weak default
private String jwtSecret;

// ✅ Require strong secret from environment
@Value("${jwt.secret}")  // fail-fast if not set
private String jwtSecret;
```

### A03 — Injection

**SQL Injection:**
```java
// ❌ String concatenation — SQL injection
String query = "SELECT * FROM users WHERE email = '" + email + "'";
em.createNativeQuery(query).getResultList();

// ✅ JPA named parameters
em.createQuery("SELECT u FROM User u WHERE u.email = :email", User.class)
  .setParameter("email", email)
  .getResultList();
```

**OpenSearch Injection (HiveArmor-specific):**
```java
// ❌ String concat into query body — injection risk
String query = "{\"query\":{\"match\":{\"source\":\"" + userInput + "\"}}}";

// ✅ Use QueryBuilders DSL
BoolQueryBuilder bool = QueryBuilders.boolQuery()
    .must(QueryBuilders.matchQuery("source", userInput));  // parameterized
```

### A04 — Insecure Design
```java
// ❌ SEC-01: Password in GET query param (existing issue)
@GetMapping("/api/check-credentials")
public boolean check(@RequestParam String password) { ... }
// Fix: POST with request body, never GET

// ❌ Returning full exception stacktrace to client
return ResponseEntity.badRequest().body(e.getMessage() + "\n" + e.getStackTrace());
// ✅ ProblemDetail with generic message; log full exception server-side
```

### A05 — Security Misconfiguration
```java
// ❌ SEC-03: CORS wildcard (existing issue)
corsConfig.addAllowedOrigin("*");
// ✅ Explicit origins
corsConfig.addAllowedOrigin("https://app.hivearmor.io");

// ❌ Stack trace in 500 responses (default Spring behavior in dev)
// ✅ Disable in prod: server.error.include-stacktrace=never

// ❌ Actuator endpoints exposed without auth
// ✅ management.endpoints.web.exposure.include=health,info only
// + .requestMatchers("/actuator/**").hasRole("ADMIN")
```

### A06 — Vulnerable Components
```
→ Use maven-dependency-audit skill to check for CVEs
→ OWASP plugin configured with failBuildOnCVSS=7
→ Key packages to watch: Spring Boot, Jackson, Netty, Liquibase
```

### A07 — Identification & Authentication Failures
```java
// ❌ SEC-02: JWT key regenerated on restart (existing issue)
// Fix: persist JWT signing key to database or use asymmetric keys (RSA/EC)

// ❌ No rate limiting on login endpoint
// ✅ Add rate limiter (e.g., Bucket4j) to /api/authenticate

// ❌ No account lockout after failed attempts
// ✅ Track failed attempts in Redis/DB, lock after 5 failures
```

### A08 — Software & Data Integrity
```java
// ❌ Deserializing untrusted data with ObjectInputStream
ObjectInputStream ois = new ObjectInputStream(inputStream);
Object obj = ois.readObject();  // RCE risk

// ✅ Use Jackson with type restrictions
ObjectMapper mapper = new ObjectMapper();
mapper.activateDefaultTyping(LaissezFaireSubTypeValidator.instance,
    ObjectMapper.DefaultTyping.NON_FINAL);  // Only with trusted input
// Better: define exact DTOs, no polymorphic deserialization of untrusted data
```

### A09 — Security Logging & Monitoring
```java
// ✅ Log security events (already required by AGENTS.md audit trail rules)
// Login / logout
log.info("AUTH: user={} action=login ip={}", username, remoteIp);
// Alert status changes
log.info("AUDIT: alertId={} status={}→{} by={}", id, prev, next, user);

// ❌ Never log sensitive data
log.info("Login attempt for {} with password {}", user, password);  // NEVER
// ✅ Log the event, not the secret
log.info("Login attempt for user={}", user);
```

### A10 — SSRF (Server-Side Request Forgery)
```java
// ❌ Fetching user-supplied URL without validation
@PostMapping("/api/ha-webhook/test")
public ResponseEntity<?> testWebhook(@RequestParam String url) {
    restTemplate.postForObject(url, payload, String.class);  // SSRF
}

// ✅ Allowlist valid webhook domains
private static final Set<String> ALLOWED_WEBHOOK_DOMAINS = Set.of(
    "hooks.slack.com", "discord.com", "pagerduty.com"
);
URI uri = URI.create(url);
if (!ALLOWED_WEBHOOK_DOMAINS.contains(uri.getHost())) {
    throw new BadRequestException("Webhook domain not allowed");
}
```

---

## Audit Output Format

```
## Security Audit — [ClassName / Feature]

### Critical (fix before merge)
- [file:line] [OWASP category] — [finding] → [fix]

### High (fix before release)  
- [file:line] [OWASP category] — [finding] → [fix]

### Medium (fix within 2 sprints)
- [file:line] [OWASP category] — [finding] → [fix]

### Already covered by existing issues
- SEC-01 (password in GET) — tracked
- SEC-02 (JWT key rotation) — tracked
- SEC-03 (CORS wildcard) — tracked
- SEC-04 (InsecureTrustManagerFactory) — tracked
```
