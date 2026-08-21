---
name: owasp-security
description: OWASP Top 10:2025, ASVS 5.0, Agentic AI security (LLM01-LLM10) — code review checklist for Java, Go, and TypeScript. Triggers automatically when reviewing security-sensitive code.
metadata:
  type: skill
  source: agamm/Codex-owasp (adapted for HiveArmor stack)
---

# OWASP Security Checklist — HiveArmor

## Auto-Trigger Conditions
Load this skill when: reviewing backend Java, Go plugins, or when a prompt mentions
"security", "auth", "injection", "XSS", "CORS", "JWT", "vulnerability", "OWASP".

## Known Open Issues — Never Replicate
From `SEC-FIXES.md` and AGENTS.md:
- **SEC-01:** Password in GET query param — `AccountResource.java` — do NOT copy this pattern
- **SEC-02:** JWT key regenerated on restart — `TokenProvider.java` — use persistent key
- **SEC-03:** CORS `allowed-origins: '*'` in prod config — never add wildcard CORS
- **SEC-04:** `InsecureTrustManagerFactory` / `InsecureSkipVerify: true` in gRPC/TLS — never add

## OWASP Top 10:2025 — Code Review Checklist

### A01 — Broken Access Control
```java
// Every endpoint needs one of:
@PreAuthorize("hasRole('USER')")  // method level
// OR explicit entry in SecurityConfiguration.java
// SCAN: grep for @GetMapping|@PostMapping|@PutMapping|@DeleteMapping 
//       that lack @PreAuthorize and aren't in permitAll list
```

### A02 — Cryptographic Failures
- No MD5/SHA1 for passwords — BCrypt only (JHipster default)
- No secrets in source code, logs, or URL params
- TLS 1.2 minimum on all connections (1.3 preferred for gRPC)
- JWT: HS512 minimum, key >= 256 bits

### A03 — Injection
```java
// OpenSearch — use SearchUtil DSL builders ONLY, never string concat
// BAD:
String query = "{\"query\":{\"match\":{\"message\":\"" + userInput + "\"}}}";

// GOOD — use the SearchUtil DSL
SearchQuery q = SearchUtil.matchQuery("message", userInput);

// SQL — use Spring Data/JPA parameter binding, never string concat
// GOOD:
@Query("SELECT a FROM Alert a WHERE a.source = :source")
List<Alert> findBySource(@Param("source") String source);  // parameterized

// BAD:
@Query("SELECT a FROM Alert a WHERE a.source = '" + source + "'")  // injection
```

### A07 — Authentication Failures
- JWT tokens: validate signature, expiry, issuer on every request
- No credentials in logs (redact passwords, tokens in log statements)
- Rate limit authentication endpoints
- Implement account lockout after N failed attempts

### A09 — Security Logging Failures
```java
// Required audit events (from AGENTS.md):
// - Alert status changes ✓
// - Incident status changes ✓
// - User login/logout ✓ (UserJWTController)
// - Agent remote commands ✓
// - API key usage ✓

// Log format — include user, action, target, outcome — never log passwords
log.info("AUDIT: user={} action={} target={} outcome={}", 
    user, "ALERT_STATUS_CHANGE", alertId, "success");
```

## Agentic AI Security (LLM01-LLM10) — Relevant for F-15 SOC AI

### LLM01 — Prompt Injection
The SOC AI assistant processes alert data and log content that may contain injected instructions.
```java
// Sanitize log content before including in prompts
// Never directly interpolate raw log messages into LLM prompts
// Use a structured schema — pass data as JSON, not raw text
String prompt = "Analyze this alert: " + alert.getMessage();  // BAD — injection risk
// GOOD:
Map<String, Object> alertData = Map.of("id", alert.getId(), "source", alert.getSource(), ...);
String prompt = "Analyze this alert data: " + objectMapper.writeValueAsString(alertData);
```

### LLM02 — Insecure Output Handling
- Treat all LLM output as untrusted — sanitize before rendering in UI
- Never execute code suggested by LLM without validation
- SIEM AI suggestions: show as read-only recommendations, require human confirmation

### LLM06 — Excessive Agency
SOC AI should be advisory-only — it must not:
- Automatically change alert status
- Automatically trigger SOAR playbooks
- Make changes to rules or configurations
All AI-suggested actions require explicit human approval.

## Go Security Checklist
```go
// Never InsecureSkipVerify in new code (SEC-04)
// Never InsecureTrustManagerFactory

// OpenSearch queries — use typed search body, not raw strings
// Use crypto/rand for any randomness that needs to be secure
// Use golang.org/x/crypto for password hashing in agent auth
```

## TypeScript/Frontend Security Checklist
- JWT stored in `localStorage` under key `hivearmor_auth_token` — never in cookies without Secure+HttpOnly
- All API calls through the `/api/[...path]/route.ts` proxy — never direct backend calls from browser
- User-supplied values in dashboard filters: encode before including in OpenSearch queries
- Never `dangerouslySetInnerHTML` with any server-provided data
