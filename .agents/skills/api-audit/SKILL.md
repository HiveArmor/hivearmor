---
name: api-audit
description: API security audit — OWASP API Top 10 (2023), BOLA/BFLA/mass assignment/SSRF/GraphQL/webhooks, REST/GraphQL/RPC surfaces. Triggered by "API security audit", "OWASP API Top 10", "BOLA vulnerability", "API authorization check", "GraphQL security".
---

# API Security Audit — OWASP API Top 10 (2023)

Surface-driven audit methodology covering REST, GraphQL, RPC, and webhooks.

## Audit Scope Setup

Before diving in, map four things:
1. **All API surfaces** — routes, resolvers, procedures, server actions, webhooks
2. **Auth model** — JWT, sessions, API keys, OAuth, mTLS
3. **Tenancy model** — single vs. multi-tenant, row-level isolation
4. **Sensitive resources** — user data, payments, admin functions

## OWASP API Top 10 Checks

### API1 — BOLA (Broken Object Level Authorization)

"The #1 API vulnerability by exploitation frequency."

```java
// ❌ Fetch then check
Alert alert = alertRepo.findById(id).orElseThrow();
if (!alert.getOrganizationId().equals(currentUser.getOrgId())) throw new Forbidden();

// ✅ Combined query — prevents timing leak
Alert alert = alertRepo.findByIdAndOrganizationId(id, currentUser.getOrgId())
    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
```

Grep targets for HiveArmor:
```bash
grep -rn "findById\|getById" backend/src/main/java/ | grep -v "OrganizationId\|OrgId\|userId"
```

### API2 — Broken Authentication

```bash
# Check for JWT alg:none acceptance
grep -rn "allowedAlgorithms\|none.*algorithm" backend/src/main/java/

# Check for API keys in URL params (SEC-01 known issue)
grep -rn "@RequestParam.*[Kk]ey\|@RequestParam.*[Tt]oken\|@RequestParam.*password" \
  backend/src/main/java/
```

### API3 — Mass Assignment / Excessive Data Exposure

```java
// ❌ Returns full entity including sensitive fields
@GetMapping("/api/ha-users/{id}")
public User getUser(@PathVariable Long id) {
    return userRepo.findById(id).orElseThrow();  // exposes passwordHash, apiKeys
}

// ✅ Returns curated DTO
@GetMapping("/api/ha-users/{id}")
public UserDTO getUser(@PathVariable Long id) {
    return userRepo.findUserDTOById(id).orElseThrow();
}
```

### API4 — Unrestricted Resource Consumption

```java
// ✅ Rate limiting on auth endpoints
@RateLimiter(name = "authentication", fallbackMethod = "rateLimitFallback")
@PostMapping("/api/authenticate")

// ✅ Bounded pagination
@GetMapping("/api/ha-alerts")
public Page<AlertDTO> getAlerts(
    @RequestParam(defaultValue = "0") int page,
    @RequestParam(defaultValue = "25") @Max(100) int size  // cap at 100
)
```

### API5 — BFLA (Broken Function Level Authorization)

```bash
# Find endpoints without @PreAuthorize
grep -rn "@GetMapping\|@PostMapping\|@PutMapping\|@DeleteMapping\|@PatchMapping" \
  backend/src/main/java/com/hivearmor/web/rest/ | \
  while read line; do
    file=$(echo $line | cut -d: -f1)
    grep -B2 "@.*Mapping" $file | grep -L "@PreAuthorize"
  done
```

### API7 — SSRF

```java
// ❌ User-controlled URL fetched server-side
String webhookUrl = request.getParameter("webhookUrl");
restTemplate.postForObject(webhookUrl, payload, String.class);

// ✅ Allow-list validation
private static final List<String> ALLOWED_WEBHOOK_HOSTS = List.of("hooks.slack.com", "api.pagerduty.com");
URI uri = URI.create(webhookUrl);
if (!ALLOWED_WEBHOOK_HOSTS.contains(uri.getHost())) {
    throw new BadRequestException("Webhook host not allowed");
}
```

## GraphQL-Specific Checks

- [ ] Introspection disabled in production
- [ ] Field-level authorization on sensitive types
- [ ] Query depth limit (max 5 levels)
- [ ] Query complexity limit (max 1000)
- [ ] Batching abuse prevention

## Webhook-Specific Checks

- [ ] HMAC signature verification on all incoming webhooks
- [ ] Timestamp tolerance check (reject replays >5 min old)
- [ ] Webhook path includes random secret component

## HiveArmor API Audit Checklist

```bash
# All endpoints have /api/ha- prefix
grep -rn "@RequestMapping\|@GetMapping\|@PostMapping" backend/src/main/java/ | \
  grep -v "/api/ha-\|/api/authenticate\|/api/account"

# All endpoints have authorization
grep -rn "class.*Resource" backend/src/main/java/com/hivearmor/web/rest/ | \
  while read file; do grep -L "@PreAuthorize\|@Secured" $file; done
```
