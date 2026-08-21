---
name: clean-code
description: Clean code principles for Java — naming, function size, DRY/KISS/YAGNI, guard clauses, magic numbers, dead code. Triggered by "clean this code", "refactor", "improve readability", "code smell".
---

# Clean Code Skill — Java

Apply DRY, KISS, and YAGNI to produce readable, maintainable HiveArmor code.

## Core Principles

- **DRY**: Every piece of knowledge must have a single, unambiguous representation.
- **KISS**: The simplest solution is usually the best.
- **YAGNI**: Don't add functionality until it's necessary. No hypothetical future requirements.

---

## 1. Naming

```java
// ❌ Cryptic, abbreviated, or misleading
int d;
String s;
boolean flag;
void process();
List<Object> data;

// ✅ Intention-revealing
int daysSinceLastAlertTriaged;
String alertSourceHostname;
boolean isSuppressed;
void tagAlertsWithMitreCategories();
List<Alert> criticalOpenAlerts;

// ✅ Booleans: is/has/can/should prefix
boolean isActive;
boolean hasOpenIncidents;
boolean canEscalate;
boolean shouldNotify;

// ✅ Collections: plural noun
List<Alert> alerts;
Map<String, Rule> rulesByName;
Set<String> allowedSources;
```

---

## 2. Functions

```java
// ❌ Function does multiple things at different abstraction levels
public void processAlertBatch(List<Alert> alerts) {
    // validate input
    if (alerts == null || alerts.isEmpty()) return;
    // enrich with geo data
    for (Alert a : alerts) {
        String country = geoService.lookup(a.getSourceIp()).getCountry();
        a.setSourceCountry(country);
    }
    // tag with MITRE
    for (Alert a : alerts) {
        if (a.getEventType().startsWith("auth")) {
            a.addTag("T1078");
        }
    }
    // save
    alertRepo.saveAll(alerts);
    // send notifications for critical
    alerts.stream()
        .filter(a -> a.getSeverity() == Severity.CRITICAL)
        .forEach(notificationService::notify);
}

// ✅ Single level of abstraction per function
public void processAlertBatch(List<Alert> alerts) {
    if (alerts == null || alerts.isEmpty()) return;
    List<Alert> enriched = enrichWithGeo(alerts);
    List<Alert> tagged = tagWithMitre(enriched);
    alertRepo.saveAll(tagged);
    notifyCritical(tagged);
}

private List<Alert> enrichWithGeo(List<Alert> alerts) { ... }
private List<Alert> tagWithMitre(List<Alert> alerts) { ... }
private void notifyCritical(List<Alert> alerts) { ... }
```

**Rule:** Functions should do **one thing** at **one level of abstraction**.
**Size:** Under 20 lines is ideal; over 50 lines is a smell.
**Parameters:** More than 3 → introduce a parameter object.

---

## 3. Guard Clauses (Fail Fast)

```java
// ❌ Nested conditionals — hard to follow the happy path
public AlertTag evaluate(Alert alert, Rule rule) {
    if (alert != null) {
        if (rule != null) {
            if (rule.isActive()) {
                if (alert.getSeverity().isAtLeast(rule.getMinSeverity())) {
                    return rule.getTag();
                }
            }
        }
    }
    return AlertTag.NONE;
}

// ✅ Guard clauses — happy path is obvious
public AlertTag evaluate(Alert alert, Rule rule) {
    if (alert == null || rule == null) return AlertTag.NONE;
    if (!rule.isActive()) return AlertTag.NONE;
    if (!alert.getSeverity().isAtLeast(rule.getMinSeverity())) return AlertTag.NONE;
    return rule.getTag();
}
```

---

## 4. Magic Numbers → Named Constants

```java
// ❌ What does 30000 mean? Why 5?
if (elapsedMs > 30000) escalate();
for (int i = 0; i < 5; i++) retry();
List<Alert> batch = new ArrayList<>(100);

// ✅ Named constants communicate intent
private static final long ESCALATION_THRESHOLD_MS = 30_000;  // 30s SLA
private static final int MAX_RETRY_ATTEMPTS = 5;
private static final int DEFAULT_BATCH_SIZE = 100;

if (elapsedMs > ESCALATION_THRESHOLD_MS) escalate();
for (int i = 0; i < MAX_RETRY_ATTEMPTS; i++) retry();
List<Alert> batch = new ArrayList<>(DEFAULT_BATCH_SIZE);
```

---

## 5. Comments

```java
// ❌ Comment restates what code says
// Increment counter by 1
counter++;

// ❌ Comment explains HOW — the code should do that
// Loop through all alerts and check if severity is critical, if so escalate
for (Alert a : alerts) {
    if (a.getSeverity() == Severity.CRITICAL) escalate(a);
}

// ✅ Comment explains WHY — a non-obvious constraint or workaround
// OpenSearch bulk API rejects payloads > 5MB — cap batch at 100 docs
if (batch.size() >= 100) { flush(batch); batch.clear(); }

// ✅ Comment for regulatory/business reason
// GDPR Article 17: events older than retention period must not be re-indexed
if (event.getTimestamp().isBefore(retentionCutoff)) return;
```

---

## 6. Primitive Obsession → Value Objects

```java
// ❌ Primitive types carry no validation or meaning
public void createAlert(String sourceIp, String severity, int ruleId) { ... }
// What format is sourceIp? What values can severity have? Can ruleId be 0?

// ✅ Value objects enforce invariants
public record SourceIp(String value) {
    public SourceIp {
        if (!IP_PATTERN.matcher(value).matches())
            throw new IllegalArgumentException("Invalid IP: " + value);
    }
}

public enum Severity { CRITICAL, HIGH, MEDIUM, LOW, INFO }
// Severity.valueOf("INVALID") → IllegalArgumentException — safe

public record RuleId(long value) {
    public RuleId { if (value <= 0) throw new IllegalArgumentException("RuleId must be positive"); }
}
```

---

## 7. Dead Code Removal

```bash
# Find unused private methods
grep -rn "private.*void\|private.*String\|private.*List" \
  backend/src/main/java/com/hivearmor/ | grep -v test | grep -v //

# Find commented-out code blocks (technical debt)
grep -rn "//.*return\|//.*for\|//.*if\|// TODO" \
  backend/src/main/java/com/hivearmor/ | wc -l
```

```java
// ❌ Commented-out code — version control exists for history
// public void oldProcessMethod(Alert a) {
//     ...50 lines...
// }

// ✅ Delete it. git log recovers it if ever needed.
```

---

## Clean Code Review Checklist

- [ ] Every variable/method/class name communicates intent without a comment
- [ ] Functions under 20 lines, single abstraction level
- [ ] No more than 3 parameters per function (use parameter object for more)
- [ ] No magic numbers — named constants for all non-trivial literals
- [ ] Guard clauses instead of nested if/else
- [ ] No commented-out code
- [ ] No TODO older than one sprint
- [ ] Boolean variables prefixed with is/has/can/should
- [ ] No primitive obsession on domain concepts (use value objects or enums)
- [ ] No duplicate code blocks (DRY — extract shared logic)
