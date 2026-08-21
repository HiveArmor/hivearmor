---
name: owasp-audit
description: OWASP Top 10 (2021) code audit — broken access control, crypto failures, injection, insecure design, misconfiguration, vulnerable components, auth failures, integrity failures, logging failures, SSRF. Triggered by "OWASP audit", "security code review", "OWASP Top 10 check", "broken access control", "SQL injection check".
---

# OWASP Top 10 (2021) Security Audit

Systematic source code audit across ten vulnerability categories.

## Audit Setup

1. Identify language, framework, architecture
2. Map entry points (routes, API handlers, form processors)
3. Trace data flows: input → processing → storage → output
4. Locate auth/authorization boundaries

## A01 — Broken Access Control

```java
// ❌ Returns different errors revealing resource state — IDOR
Alert alert = alertRepo.findById(id).orElseThrow(); // 404 if not found
if (!alert.getOrgId().equals(user.getOrgId()))
    throw new ForbiddenException(); // 403 if unauthorized — attacker learns it exists

// ✅ Single combined query — same response for not-found and not-authorized
Alert alert = alertRepo.findByIdAndOrgId(id, user.getOrgId())
    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
```

Watch for:
- IDOR via foreign-key parameters in mutation payloads
- `@PreAuthorize` missing on new endpoints (see HiveArmor AGENTS.md)
- Open redirects via `?from=`, `?next=`, `?returnTo=` parameters

## A02 — Cryptographic Failures

```bash
# Scan for weak hashing
grep -rn "MD5\|SHA1\|SHA-1" --include="*.java" backend/src/
grep -rn "Math\.random\(\)" --include="*.java" backend/src/

# Check for plaintext secrets
grep -rn "password.*=.*['\"]" --include="*.yml" --include="*.properties" backend/src/
```

- Avoid MD5/SHA1 for passwords — use bcrypt (cost ≥12), Argon2, or scrypt
- See `crypto-audit` skill for full cryptography review

## A03 — Injection

```java
// ❌ SQL injection via string concatenation
String query = "SELECT * FROM alerts WHERE source = '" + userInput + "'";

// ✅ Parameterized query
String query = "SELECT * FROM alerts WHERE source = ?";
PreparedStatement ps = conn.prepareStatement(query);
ps.setString(1, userInput);

// ❌ OpenSearch injection — HiveArmor specific rule
String searchQuery = "{\"query\":{\"match\":{\"message\":\"" + userInput + "\"}}}";

// ✅ Use SearchUtil DSL builders (HiveArmor)
SearchRequest request = SearchUtil.buildMatchQuery("message", userInput);
```

## A04 — Insecure Design

```java
// ❌ Rate limiting only in UI layer
// ✅ Rate limiting at API layer
@RateLimiter(name = "login", fallbackMethod = "rateLimitFallback")
@PostMapping("/api/authenticate")

// ❌ Background job loses request-scoped auth
@Async
public void processAlert(Long alertId) {
    // no auth check — runs as system
}
// ✅ Re-verify in background jobs if accessing user-owned resources
```

## A05 — Security Misconfiguration

```java
// ✅ HSTS header
// max-age=63072000; includeSubDomains; preload
// Verify ALL subdomains serve HTTPS before enabling preload

// Check admin endpoints aren't guarded only by environment check
@GetMapping("/admin/metrics")
@Profile("!production")  // ❌ leaves staging exposed
```

## A06 — Vulnerable Components

```bash
# Java
cd backend && mvn -s settings.xml dependency-check:check -DfailBuildOnCVSS=7

# Go
govulncheck ./...

# Frontend
cd frontend-v2 && npm audit --omit=dev --audit-level=high
```

## A07 — Auth Failures

```java
// ❌ Non-constant-time comparison — timing attack
if (providedToken.equals(storedToken)) { ... }

// ✅ Constant-time comparison
if (MessageDigest.isEqual(
    providedToken.getBytes(), storedToken.getBytes())) { ... }
```

## A09 — Logging & Monitoring Failures

```java
// ❌ Empty catch block hides attack signals
try { processAlert(id); } catch (Exception e) { /* ignored */ }

// ✅ At minimum log the error
try { processAlert(id); } catch (Exception e) {
    log.error("Alert processing failed for id={}", id, e);
}
```

Required audit trail events (AGENTS.md): alert status, incident status, login, agent commands, API key usage.

## A10 — SSRF

```java
// Block metadata endpoints
private static final List<String> BLOCKED_HOSTS = List.of(
    "169.254.169.254",      // AWS IMDS
    "metadata.google.internal",  // GCP metadata
    "169.254.170.2"         // AWS ECS metadata
);

URI uri = URI.create(userUrl);
if (BLOCKED_HOSTS.contains(uri.getHost())) {
    throw new BadRequestException("URL not allowed");
}
```

## Report Structure

Each category shows one of:
- **Findings** — severity + remediation steps
- **Clean** — what was grepped/tested, no issues found
- **N/A** — why category is inapplicable

Each finding disposition: **Fixed**, **Deferred**, or **Accepted Risk** (accepted requires documented compensating controls + re-evaluation trigger).

## Second-Pass Requirement

After initial audit AND after fixes, run an adversarial second pass — "assume the author is overconfident; find what they missed" — ideally with a different reviewer.
