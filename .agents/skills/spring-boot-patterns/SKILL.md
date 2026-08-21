---
name: spring-boot-patterns
description: Spring Boot 3.x patterns for HiveArmor backend — controller/service/repository layering, response envelopes, scheduled workers, JHipster 8 conventions. Use for all backend Java work.
metadata:
  type: skill
  source: decebals/Codex-java + rrezartprebreza/spring-boot-skills (adapted)
---

# Spring Boot 3.x Patterns — HiveArmor Backend

## Project Context
- Package: `com.hivearmor`
- Spring Boot 3.3 + JHipster 8
- All endpoints at `/api/ha-*`
- Response envelope: use JHipster's standard `ResponseEntity<T>`
- Security: `@PreAuthorize` on every endpoint or explicit entry in `SecurityConfiguration.java`

## Layering Rule
```
Controller (com.hivearmor.web.rest.*) 
  → Service (com.hivearmor.service.*) 
  → Repository (com.hivearmor.repository.*)
```
Controllers never call repositories directly. Services contain all business logic.

## Standard REST Controller Pattern
```java
@RestController
@RequestMapping("/api")
@PreAuthorize("hasRole('USER')")  // required on every controller
public class UtmAlertResource {

    private static final Logger log = LoggerFactory.getLogger(UtmAlertResource.class);
    private final AlertService alertService;

    public UtmAlertResource(AlertService alertService) {  // constructor injection only
        this.alertService = alertService;
    }

    @GetMapping("/ha-alerts")
    public ResponseEntity<List<AlertDTO>> getAlerts(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "25") int size,
            @RequestParam(required = false) String severity) {
        
        Page<AlertDTO> result = alertService.findAll(PageRequest.of(page, size), severity);
        HttpHeaders headers = PaginationUtil.generatePaginationHttpHeaders(
            ServletUriComponentsBuilder.fromCurrentRequest(), result);
        return ResponseEntity.ok().headers(headers).body(result.getContent());
    }

    @PostMapping("/ha-alerts/{id}/status")
    public ResponseEntity<AlertDTO> updateStatus(
            @PathVariable Long id,
            @Valid @RequestBody AlertStatusRequest request) {
        // Audit trail required for alert status changes
        AlertDTO result = alertService.updateStatus(id, request, SecurityUtils.getCurrentUserLogin());
        return ResponseEntity.ok(result);
    }
}
```

## Scheduled Workers Pattern (existing in codebase)
```java
@Component
public class AlertTaggingWorker {
    
    @Scheduled(fixedDelay = 30_000)  // 30s — matches existing pattern
    @Transactional
    public void tagAlerts() {
        // Keep under 25s execution time to avoid overlap
    }
}
```
Existing workers: alert tagging (30s), SOAR rules (30s), pipeline sync (20s), OS health (60s), compliance (5s), user cleanup (daily 01:00).

## Never Use Field Injection
```java
// BAD — untestable, JHipster legacy, do not replicate
@Autowired
private AlertRepository alertRepository;

// GOOD — constructor injection
public AlertService(AlertRepository alertRepository) {
    this.alertRepository = alertRepository;
}
```

## Error Handling — ProblemDetail (Spring 6+)
```java
@ExceptionHandler(AlertNotFoundException.class)
public ProblemDetail handleAlertNotFound(AlertNotFoundException ex) {
    ProblemDetail pd = ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, ex.getMessage());
    pd.setTitle("Alert Not Found");
    return pd;
}
```

## API Rules (from AGENTS.md)
- All endpoints at `/api/ha-*`
- No API versioning — no `/v1/`, `/v2/` prefixes
- Breaking changes: keep old endpoint with `Deprecation` header for 2 releases
- Every new endpoint: `@PreAuthorize` or explicit in `SecurityConfiguration.java`

## Audit Trail — Required for These Operations
```java
// Always log to audit trail for:
// - Alert status changes
// - Incident status changes  
// - User login/logout (already in UserJWTController)
// - Agent remote commands
// - API key usage
applicationEventService.createEvent(AuditEventType.ALERT_STATUS_CHANGE, 
    Map.of("alertId", id, "oldStatus", old, "newStatus", request.getStatus(), 
           "user", currentUser));
```
