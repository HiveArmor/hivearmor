---
name: design-patterns
description: Java design patterns for HiveArmor — Builder, Factory, Strategy, Observer (Spring events), Decorator, Adapter. Triggered by "use factory pattern", "implement strategy", "design pattern for X", "which pattern should I use".
---

# Design Patterns Skill — Java / Spring Boot

Match the right pattern to the problem. Avoid over-engineering — sometimes `new` is sufficient.

## Pattern Selection Guide

| Problem | Pattern |
|---|---|
| Many optional constructor params | Builder |
| Create objects without knowing exact class | Factory Method |
| Swappable algorithms / behaviors | Strategy |
| React to events without tight coupling | Observer (Spring Events) |
| Add behavior without modifying class | Decorator |
| Integrate incompatible interface | Adapter |
| Template with variable steps | Template Method |
| Shared single instance | Singleton (prefer Spring bean) |

---

## Builder — Complex Object Construction

Use when: 4+ constructor parameters, optional fields, or immutable objects.

```java
// ❌ Telescoping constructor — unreadable at call site
new Alert(null, Severity.HIGH, "firewall-01", null, null, true, false);

// ✅ Builder
@Builder
public class AlertCommand {
    private final String incidentId;           // optional
    private final Severity severity;           // required
    private final String source;               // required
    private final String mitreTechnique;       // optional
    private final boolean suppressable;        // optional, default false

    // Validation in constructor
    public AlertCommand {
        Objects.requireNonNull(severity, "severity required");
        Objects.requireNonNull(source, "source required");
    }
}

// Usage
AlertCommand cmd = AlertCommand.builder()
    .severity(Severity.HIGH)
    .source("firewall-01")
    .mitreTechnique("T1190")
    .build();
```

---

## Factory Method — Decoupled Object Creation

Use when: callers shouldn't know which subclass to instantiate; creation logic belongs together.

```java
// ❌ Caller decides which class to instantiate
if (type.equals("slack")) {
    channel = new SlackNotificationChannel(webhookUrl);
} else if (type.equals("email")) {
    channel = new EmailNotificationChannel(smtpConfig);
}

// ✅ Factory isolates creation
@Component
public class NotificationChannelFactory {
    private final Map<String, NotificationChannel> channels;

    public NotificationChannelFactory(List<NotificationChannel> channels) {
        this.channels = channels.stream()
            .collect(Collectors.toMap(c -> c.getType(), c -> c));
    }

    public NotificationChannel create(String type) {
        return Optional.ofNullable(channels.get(type))
            .orElseThrow(() -> new IllegalArgumentException("Unknown channel: " + type));
    }
}
```

This is also how HiveArmor's plugin registry works — plugins self-register, engine looks them up by name.

---

## Strategy — Swappable Algorithms

Use when: same operation with different implementations; replaces if/else chains on type.

```java
// The alert tagging engine uses Strategy — each rule type is a strategy
public interface RuleEvaluator {
    boolean supports(Rule rule);
    AlertTag evaluate(Alert alert, Rule rule);
}

@Component
public class SuppressionRuleEvaluator implements RuleEvaluator {
    @Override public boolean supports(Rule r) { return r.getType() == RuleType.SUPPRESSION; }
    @Override public AlertTag evaluate(Alert a, Rule r) { /* suppression logic */ }
}

// Modern Java — lambda as strategy (for simple cases)
Map<String, Function<Alert, AlertTag>> strategies = Map.of(
    "suppress", alert -> AlertTag.SUPPRESSED,
    "escalate", alert -> AlertTag.ESCALATED
);
AlertTag result = strategies.getOrDefault(ruleName, a -> AlertTag.NONE).apply(alert);
```

---

## Observer — Spring Application Events

Use when: loose coupling between event source and handlers; audit trail; cross-cutting reactions.

```java
// Event class
public record AlertStatusChangedEvent(
    Long alertId,
    AlertStatus previous,
    AlertStatus next,
    String changedByUser
) {}

// Publisher (AlertService)
@Service
public class AlertService {
    private final ApplicationEventPublisher eventPublisher;

    public void updateStatus(Long id, AlertStatus newStatus, String user) {
        Alert alert = alertRepo.findById(id).orElseThrow();
        AlertStatus prev = alert.getStatus();
        alert.setStatus(newStatus);
        alertRepo.save(alert);
        eventPublisher.publishEvent(new AlertStatusChangedEvent(id, prev, newStatus, user));
    }
}

// Listeners — add new reactions without touching AlertService
@Component
public class AlertAuditListener {
    @EventListener
    public void onStatusChange(AlertStatusChangedEvent event) {
        auditService.log(event);  // audit trail (required by AGENTS.md)
    }
}

@Component
public class AlertIncidentLinker {
    @EventListener
    @Async  // async so it doesn't block the status update
    public void onStatusChange(AlertStatusChangedEvent event) {
        if (event.next() == AlertStatus.OPEN) {
            incidentService.evaluateForIncident(event.alertId());
        }
    }
}
```

---

## Decorator — Composable Behavior

Use when: adding optional behavior to existing objects without subclassing.

```java
// Core interface
public interface AlertEnricher {
    Alert enrich(Alert alert);
}

// Base implementation
@Component
public class GeoEnricher implements AlertEnricher {
    public Alert enrich(Alert alert) {
        // add geo data to source_ip
        return alert;
    }
}

// Decorator adds behavior
@Component
public class ThreatIntelEnricher implements AlertEnricher {
    private final AlertEnricher delegate;  // wraps another enricher
    private final ThreatIntelRepository threatIntel;

    public Alert enrich(Alert alert) {
        alert = delegate.enrich(alert);  // run delegate first
        // add threat-intel tags
        return alert;
    }
}

// Chain: alert → GeoEnricher → ThreatIntelEnricher → alert
```

---

## Adapter — Legacy / External Interface Integration

Use when: integrating a library or external API with an incompatible interface.

```java
// External threat feed client has its own interface
public class ThreatWindsClient {
    public ThreatWindsResult lookup(String ip) { ... }
}

// HiveArmor uses its own port interface
public interface ThreatIntelLookup {
    Optional<ThreatInfo> lookup(String ip);
}

// Adapter bridges them
@Component
public class ThreatWindsAdapter implements ThreatIntelLookup {
    private final ThreatWindsClient client;

    public Optional<ThreatInfo> lookup(String ip) {
        ThreatWindsResult result = client.lookup(ip);
        if (result == null || !result.isMalicious()) return Optional.empty();
        return Optional.of(new ThreatInfo(ip, result.getScore(), result.getTags()));
    }
}
```

---

## Anti-Patterns to Avoid

| Anti-Pattern | Problem | Fix |
|---|---|---|
| Singleton abuse | Hard to test, global state | Spring singleton bean with constructor injection |
| Factory everywhere | Over-engineering simple `new` | Only use factory when creation is complex or polymorphic |
| Deep decorator chains | Hard to debug, 5+ wrappers | Consider a pipeline/chain-of-responsibility instead |
| Observer cascade | Event A triggers B triggers C → silent failures | Keep event handlers independent, idempotent |
| Builder for 2-field class | Boilerplate without benefit | Use constructor for < 3 parameters |
