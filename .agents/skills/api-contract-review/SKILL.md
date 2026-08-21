---
name: api-contract-review
description: Review and design REST API contracts for HiveArmor — response envelopes, error shapes, pagination, deprecation headers. Use before adding or changing any /api/ha-* endpoint.
metadata:
  type: skill
  source: decebals/Codex-java + rrezartprebreza/spring-boot-skills (adapted)
---

# API Contract Review — HiveArmor

## Checklist — Run Before Merging Any Endpoint Change

### Security
- [ ] Endpoint has `@PreAuthorize` annotation OR is in `SecurityConfiguration.java` permitAll list
- [ ] No password/secret in URL query params (SEC-01)
- [ ] No new `@RequestParam("password")` or `?password=` in GET endpoints
- [ ] Internal-only endpoints use `InternalApiKeyFilter` pattern, not public auth

### Contract Shape
- [ ] Endpoint prefix is `/api/ha-*`
- [ ] List endpoints return paginated `Page<DTO>` with `X-Total-Count` header
- [ ] Single-item endpoints return `ResponseEntity<DTO>` (not the entity directly)
- [ ] Error responses use `ProblemDetail` (RFC 9457) — not custom `{success: false}` shapes
- [ ] Created resources return `201 Created` with `Location` header
- [ ] Successful deletes return `204 No Content`

### Breaking Change Rule
If removing or renaming a field/endpoint:
```java
// Keep old endpoint for 2 releases with deprecation header
@Deprecated
@GetMapping("/ha-alerts-old")
public ResponseEntity<?> oldEndpoint() {
    HttpHeaders headers = new HttpHeaders();
    headers.add("Deprecation", "version=\"2026-10-01\"");
    headers.add("Sunset", "Thu, 01 Jan 2027 00:00:00 GMT");
    headers.add("Link", "</api/ha-alerts>; rel=\"successor-version\"");
    return ResponseEntity.ok().headers(headers).body(newService.findAll());
}
```

### Pagination Contract (standard across all list endpoints)
```java
// Request params
@RequestParam(defaultValue = "0") int page     // 0-based
@RequestParam(defaultValue = "25") int size     // default 25, max 200
@RequestParam(required = false) String sort     // "fieldName,asc" or "fieldName,desc"

// Response headers (added by PaginationUtil)
X-Total-Count: 1450
Link: <...?page=1&size=25>; rel="next", <...?page=57&size=25>; rel="last"
```

### DTO Rules
- DTOs live in `com.hivearmor.service.dto.*`
- Entities never returned from controllers — always map to DTOs
- Use `@JsonProperty` for field name overrides, not field renames
- `Instant` for timestamps (not `Date` or `LocalDateTime`)
- Enum values serialized as strings, not ordinals

## Common Anti-Patterns to Reject

```java
// BAD — entity leaked from controller
@GetMapping("/ha-alerts/{id}")
public UtmAlert getAlert(@PathVariable Long id) { ... }

// GOOD — DTO
@GetMapping("/ha-alerts/{id}")
public ResponseEntity<AlertDTO> getAlert(@PathVariable Long id) { ... }
```

```java
// BAD — non-standard error response
return ResponseEntity.badRequest().body(Map.of("success", false, "message", "not found"));

// GOOD — ProblemDetail
ProblemDetail pd = ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, "Alert " + id + " not found");
return ResponseEntity.of(pd).build();
```

```java
// BAD — no pagination
@GetMapping("/ha-alerts")
public List<AlertDTO> getAllAlerts() { return alertService.findAll(); }  // could return millions

// GOOD — always paginate list endpoints
@GetMapping("/ha-alerts")
public ResponseEntity<List<AlertDTO>> getAlerts(
    @org.springdoc.core.annotations.ParameterObject Pageable pageable) { ... }
```
