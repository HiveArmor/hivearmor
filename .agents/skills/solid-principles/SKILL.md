---
name: solid-principles
description: SOLID principles review for Java — identify violations, suggest refactoring. Triggered by "check SOLID", "single responsibility", "open/closed principle", "dependency inversion", "interface segregation".
---

# SOLID Principles Skill — Java

Apply and review SOLID principles in HiveArmor's Spring Boot codebase.

## Quick Violation Scan

```bash
# SRP: classes with "Manager", "Handler", "And" in name (often do too much)
grep -rn "class.*Manager\|class.*Handler\|class.*And" \
  backend/src/main/java/com/hivearmor/ | grep -v test | grep -v import

# OCP: growing switch/if-else on type (should use polymorphism)
grep -rn "instanceof\|getClass()\|switch.*type\|switch.*kind" \
  backend/src/main/java/com/hivearmor/service/ | grep -v test | grep -v //

# DIP: 'new ConcreteClass()' inside service constructors
grep -rn "= new " backend/src/main/java/com/hivearmor/service/ | \
  grep -v "ArrayList\|HashMap\|HashSet\|StringBuilder\|//\|test"
```

---

## S — Single Responsibility Principle

> One class = one reason to change.

```java
// ❌ AlertService doing too many things
@Service
public class AlertService {
    public void saveAlert(Alert a) { ... }
    public void sendEmailNotification(Alert a) { ... }  // should be NotificationService
    public void exportToCSV(List<Alert> alerts) { ... } // should be ExportService
    public void calculateRiskScore(Alert a) { ... }     // should be RiskScoringService
}

// ✅ Focused service
@Service
public class AlertService {
    private final AlertRepository alertRepo;
    private final AlertEventPublisher eventPublisher;

    public Alert createAlert(AlertCommand cmd) { ... }
    public void updateStatus(Long id, AlertStatus status) { ... }
    // Notifications, exports, scoring → separate services
}
```

**Smell signals:** Class names with "And", "Manager" (handling unrelated concerns), class > 300 lines, more than one reason a stakeholder would ask for changes.

---

## O — Open/Closed Principle

> Open for extension, closed for modification.

```java
// ❌ Adding new rule type requires modifying existing code
public class AlertTaggingEngine {
    public AlertTag evaluate(Alert alert, Rule rule) {
        if (rule.getType() == RuleType.SUPPRESSION) { ... }
        else if (rule.getType() == RuleType.ESCALATION) { ... }
        else if (rule.getType() == RuleType.CORRELATION) { ... }
        // Every new rule type requires editing this method
    }
}

// ✅ Add new types by adding new classes
public interface RuleEvaluator {
    boolean supports(Rule rule);
    AlertTag evaluate(Alert alert, Rule rule);
}

@Component
public class SuppressionRuleEvaluator implements RuleEvaluator { ... }

@Component
public class EscalationRuleEvaluator implements RuleEvaluator { ... }

// Engine is closed for modification, open for extension
@Service
public class AlertTaggingEngine {
    private final List<RuleEvaluator> evaluators;

    public AlertTag evaluate(Alert alert, Rule rule) {
        return evaluators.stream()
            .filter(e -> e.supports(rule))
            .findFirst()
            .map(e -> e.evaluate(alert, rule))
            .orElse(AlertTag.NONE);
    }
}
```

---

## L — Liskov Substitution Principle

> Subtypes must safely replace their parent.

```java
// ❌ Subclass throws where parent doesn't — violates LSP
public class ReadOnlyAlertRepository extends AlertRepository {
    @Override
    public Alert save(Alert a) {
        throw new UnsupportedOperationException("Read-only repository");
    }
}
// Code that calls save() via AlertRepository reference will break unexpectedly

// ✅ Separate interface for read-only operations
public interface AlertReader { Optional<Alert> findById(Long id); }
public interface AlertRepository extends AlertReader { Alert save(Alert a); }
// ReadOnly type implements AlertReader only — no surprise exceptions
```

**Smell:** `instanceof` before calling a method, `UnsupportedOperationException` in overrides, empty method overrides.

---

## I — Interface Segregation Principle

> Clients should not depend on interfaces they don't use.

```java
// ❌ Fat interface — many implementations only use part of it
public interface AlertOperations {
    Alert findById(Long id);
    List<Alert> findAll(Pageable p);
    Alert save(Alert a);
    void delete(Long id);
    void bulkUpdate(List<AlertStatusChange> changes);
    Page<Alert> search(AlertFilter filter);
    AlertStats getStats(DateRange range);
}

// ✅ Segregated interfaces — implementors only implement what they need
public interface AlertReader {
    Optional<Alert> findById(Long id);
    Page<Alert> findAll(AlertFilter filter, Pageable p);
}
public interface AlertWriter {
    Alert save(Alert a);
    void bulkUpdateStatus(List<AlertStatusChange> changes);
}
public interface AlertAnalytics {
    AlertStats getStats(DateRange range);
}

// Repository implements all; read-only service uses only AlertReader
```

---

## D — Dependency Inversion Principle

> Depend on abstractions, not concretions.

```java
// ❌ Service depends directly on concrete class
@Service
public class AlertNotificationService {
    private final SmtpEmailSender emailSender = new SmtpEmailSender();  // concrete + new

    public void notify(Alert alert) {
        emailSender.send(...);  // can't test without real SMTP
    }
}

// ✅ Depend on interface, inject concrete via Spring
public interface NotificationChannel {
    void send(AlertNotification notification);
}

@Component
public class SlackNotificationChannel implements NotificationChannel { ... }
@Component
public class EmailNotificationChannel implements NotificationChannel { ... }

@Service
public class AlertNotificationService {
    private final List<NotificationChannel> channels;  // injected by Spring

    public AlertNotificationService(List<NotificationChannel> channels) {
        this.channels = channels;
    }
    // Testable: inject mock channels in tests
}
```

---

## Quick Review Questions

1. Can this class's purpose be described in one sentence **without "and"**?
2. Would adding a new rule/channel/format require editing this class, or only adding a new one?
3. Can every subclass be dropped in where the parent is expected — without surprising the caller?
4. Does this interface have methods that some implementors throw `UnsupportedOperationException` for?
5. Does this service hold a `new ConcreteInfrastructure()` that prevents unit testing?

## Common Fixes

| Problem | Refactoring |
|---|---|
| God class | Extract Class, Move Method |
| Type-switching if/else | Strategy Pattern + `@Component` list |
| Broken inheritance | Composition over Inheritance |
| Fat interface | Split into role-specific interfaces |
| Hard-coded dependency | Constructor injection via Spring |
