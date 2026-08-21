---
name: logging-patterns
description: Java logging patterns for HiveArmor — structured JSON logging, MDC correlation IDs, SLF4J best practices, Spring Boot 3.4+ native JSON logging, security event audit logging. Triggered by "add logging", "debug this flow", "structured logging", "analyze logs".
---

# Logging Patterns Skill — Java / Spring Boot

Structured, queryable logs for HiveArmor's backend services.

## Core Principle

JSON logs enable direct field access without regex parsing. OpenSearch and log analysis tools consume them natively.

---

## Setup — Spring Boot 3.4+ Native JSON Logging

```yaml
# application-prod.yml
logging:
  structured:
    format:
      console: logstash   # JSON output — no extra dependencies
  level:
    root: INFO
    com.hivearmor: INFO
    com.hivearmor.web.rest: WARN   # reduce controller noise
    org.springframework.security: WARN
```

```yaml
# application-dev.yml — human-readable in dev
logging:
  structured:
    format:
      console: ecs   # or leave unset for default text
  level:
    com.hivearmor: DEBUG
```

For Spring Boot < 3.4 (use Logstash encoder):
```xml
<dependency>
    <groupId>net.logstash.logback</groupId>
    <artifactId>logstash-logback-encoder</artifactId>
    <version>7.4</version>
</dependency>
```

---

## SLF4J Patterns

### Parameterized Logging (Always)
```java
// ❌ String.format — creates string even when log level disabled
log.debug(String.format("Processing alert %s with severity %s", id, severity));

// ❌ + concatenation — same problem
log.debug("Processing alert " + id + " with severity " + severity);

// ✅ Parameterized — evaluated only if DEBUG is enabled
log.debug("Processing alert {} with severity {}", id, severity);

// ✅ Exceptions — always pass as last arg (no toString)
log.error("Failed to enrich alert {}", alertId, exception);  // NOT exception.getMessage()
```

### Log Levels

| Level | Use for |
|---|---|
| `ERROR` | Unexpected failures requiring immediate attention (OpenSearch down, plugin crash) |
| `WARN` | Recoverable issues, degraded mode, retry (threat feed timeout, slow query) |
| `INFO` | Business events, lifecycle (alert created, incident closed, plugin loaded) |
| `DEBUG` | Execution flow, values — only in dev (rule evaluation steps, query params) |
| `TRACE` | Very verbose — individual bytes, loop iterations — never in prod |

---

## MDC — Correlation IDs

Attach `requestId` to every log line for a request.

```java
// In a request filter (once per request)
@Component
public class RequestIdFilter extends OncePerRequestFilter {

    @Override
    protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain)
            throws ServletException, IOException {
        String requestId = Optional.ofNullable(req.getHeader("X-Request-ID"))
            .orElse(UUID.randomUUID().toString().substring(0, 8));
        MDC.put("requestId", requestId);
        res.setHeader("X-Request-ID", requestId);
        try {
            chain.doFilter(req, res);
        } finally {
            MDC.clear();  // always clear — thread pool reuse
        }
    }
}
```

### MDC Does NOT Propagate to New Threads
```java
// ❌ MDC lost in async context
@Async
public void processAsync(Alert alert) {
    log.info("Processing alert {}", alert.getId());  // requestId = null
}

// ✅ Copy MDC context manually
public void processAsync(Alert alert) {
    Map<String, String> mdcContext = MDC.getCopyOfContextMap();
    executor.submit(() -> {
        if (mdcContext != null) MDC.setContextMap(mdcContext);
        try {
            log.info("Processing alert {}", alert.getId());  // requestId present
        } finally {
            MDC.clear();
        }
    });
}
```

---

## Useful Log Fields for HiveArmor

```java
// Structured contextual log with key fields
MDC.put("requestId", requestId);
MDC.put("userId", currentUser);
MDC.put("alertId", String.valueOf(alertId));
MDC.put("step", "enrichment");

log.info("Alert enrichment completed duration_ms={} source={} threatScore={}",
    duration, sourceIp, threatScore);
```

| Field | Purpose |
|---|---|
| `requestId` | Groups all logs for one HTTP request |
| `alertId` | Groups all logs for one alert lifecycle |
| `userId` | Who triggered the action |
| `step` | Progress tracking through a flow |
| `duration_ms` | Performance measurement |
| `source` | Which service/component logged this |

---

## Security Event Logging (Audit Trail — Required by AGENTS.md)

```java
// ✅ Authentication events
log.info("AUTH: action={} user={} ip={} success={}", "login", username, remoteIp, success);
log.info("AUTH: action={} user={} ip={}", "logout", username, remoteIp);

// ✅ Alert status changes
log.info("AUDIT: resource=alert id={} action=status_change prev={} next={} by={}",
    alertId, previousStatus, newStatus, currentUser);

// ✅ Agent remote commands (high sensitivity)
log.info("AUDIT: resource=agent id={} action=remote_command command={} by={} approved={}",
    agentId, command, requestingUser, approvedBy);

// ✅ API key usage
log.info("AUDIT: resource=apikey id={} action=used endpoint={} ip={}",
    keyId, endpoint, remoteIp);
```

---

## What to NEVER Log

```java
// ❌ Passwords / credentials
log.info("Login attempt for {} with password {}", user, password);

// ❌ Full JWT tokens
log.debug("Token: {}", token);

// ❌ PII — full card numbers, SSN, full email in debug
log.debug("User email: {}", user.getEmail());  // avoid in prod logs

// ❌ Full stack trace as message (use exception param instead)
log.error("Error: " + e.getMessage() + "\n" + Arrays.toString(e.getStackTrace()));
// ✅ Pass exception as last arg — SLF4J renders it properly
log.error("Failed to process alert {}", alertId, e);
```

---

## Exception Logging Rule

Log exceptions **once**, at the service boundary (controller advice or GlobalExceptionHandler), not at every rethrow point.

```java
// ❌ Double logging — logged in service AND re-thrown to controller
@Service
public class AlertService {
    public Alert createAlert(AlertCommand cmd) {
        try {
            return alertRepo.save(Alert.from(cmd));
        } catch (DataIntegrityViolationException e) {
            log.error("Failed to save alert", e);  // logged here...
            throw new AlertCreationException("Duplicate alert", e);
        }
    }
}

@RestControllerAdvice
public class GlobalExceptionHandler {
    @ExceptionHandler(AlertCreationException.class)
    public ResponseEntity<?> handle(AlertCreationException e) {
        log.error("Alert creation failed", e);  // ...and here — duplicate
        return ProblemDetail.forStatus(409);
    }
}

// ✅ Rethrow in service without logging; log once in handler
@Service
public class AlertService {
    public Alert createAlert(AlertCommand cmd) {
        try {
            return alertRepo.save(Alert.from(cmd));
        } catch (DataIntegrityViolationException e) {
            throw new AlertCreationException("Duplicate alert", e);  // no log here
        }
    }
}
```

---

## Log Analysis Commands

```bash
# Filter errors from JSON logs
cat app.log | jq 'select(.level == "ERROR")'

# Find slow operations (> 1s)
cat app.log | jq 'select(.duration_ms > 1000) | {timestamp, step, duration_ms, message}'

# Trace a request by ID
cat app.log | jq 'select(.requestId == "abc12345")'

# Count errors by logger
cat app.log | jq -r 'select(.level == "ERROR") | .logger' | sort | uniq -c | sort -rn

# Alert audit trail
cat app.log | jq 'select(.message | startswith("AUDIT: resource=alert"))'
```
