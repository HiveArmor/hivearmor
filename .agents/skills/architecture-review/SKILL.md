---
name: architecture-review
description: Java architecture review — package organization, dependency direction, hexagonal architecture, anti-pattern detection. Triggered by "review architecture", "check package structure", "architecture issues", "layering violations".
---

# Architecture Review Skill

Review package structure, dependency direction, and architectural integrity.

## Core Principle

**Dependencies must point inward.** Infrastructure and web layers depend on domain/service. Domain must NEVER know about infrastructure, web, or frameworks.

```
Web (Controllers)
    ↓ depends on
Service (Business Logic)
    ↓ depends on
Domain (Entities, Value Objects, Interfaces)
    ↑ Infrastructure (Repositories, External APIs) also depends on Domain
```

---

## Package Organization Patterns

### By-Layer (traditional JHipster default — HiveArmor current)
```
com.hivearmor/
├── web/rest/         ← HTTP controllers
├── service/          ← business logic
├── domain/           ← entities, enums, interfaces
├── repository/       ← Spring Data repositories
└── config/           ← Spring configuration
```
**Risk:** As the codebase grows, layers become catch-alls. `service/` may reach 50+ classes.

### By-Feature (recommended for large modules)
```
com.hivearmor/
├── alerts/
│   ├── AlertController.java
│   ├── AlertService.java
│   ├── Alert.java
│   └── AlertRepository.java
├── incidents/
│   ├── IncidentController.java
│   └── ...
└── shared/           ← types used across features
```
**Benefit:** Feature cohesion, easier to extract microservices later.

### Hexagonal / Ports & Adapters
```
com.hivearmor/
├── domain/           ← pure Java, zero framework imports
│   ├── model/
│   └── ports/        ← interfaces (AlertRepository, EventPublisher)
└── infrastructure/
    ├── persistence/  ← JPA implementations of ports
    ├── web/          ← controllers
    └── messaging/    ← event publishers
```

---

## Dependency Direction Checks

```bash
# Find framework imports in domain package (architectural violation)
grep -rn "import org.springframework\|import jakarta.persistence\|import javax" \
  backend/src/main/java/com/hivearmor/domain/ | \
  grep -v "//\|test" | grep -v ".class"

# Find domain reaching into infrastructure/web (violation)
grep -rn "import com.hivearmor.web\|import com.hivearmor.repository" \
  backend/src/main/java/com/hivearmor/service/ | grep -v "//\|test"

# Find controllers with business logic (should be in service)
wc -l backend/src/main/java/com/hivearmor/web/rest/*.java | \
  sort -rn | head -10
# Controllers > 200 lines likely contain business logic that belongs in service
```

---

## Anti-Pattern Detection

### Big Ball of Mud
```bash
# Warning: single package with > 50 files
ls backend/src/main/java/com/hivearmor/service/*.java | wc -l
# If > 30 service classes with no sub-grouping → consider feature packages
```

### Util Dumping Ground
```bash
# Find util classes with domain logic hiding in them
grep -rn "class.*Util\|class.*Helper\|class.*Utils" \
  backend/src/main/java/com/hivearmor/ | grep -v test
# Review each — if it contains OpenSearch queries or business decisions, it belongs in a service
```

### Anemic Domain Model
```bash
# Entities with only getters/setters — all logic in service
# Signs: Entity has 0 methods except get/set/toString
grep -c "public void set\|public .* get" \
  backend/src/main/java/com/hivearmor/domain/shared_types/alert/UtmAlert.java
# High getter/setter count with no behavior = anemic model
```

### @Entity Leaking into Domain Logic
```java
// ❌ Domain service knows about JPA persistence
@Service
public class AlertService {
    public void process(Alert alert) {
        if (alert.getId() == null) {  // checking JPA-managed ID in business logic
            alertRepo.save(alert);
        }
    }
}

// ✅ Business logic independent of persistence state
public void process(AlertCommand command) {
    Alert alert = Alert.create(command);  // factory method on domain object
    alertRepo.save(alert);
}
```

---

## Architecture Review Checklist

### Layer Boundaries
- [ ] Domain package has zero Spring/JPA/Hibernate imports
- [ ] Controllers delegate to services — no business logic in controllers
- [ ] Services do not call other controllers
- [ ] Repositories only called from services (not controllers directly)

### Coupling
- [ ] Cross-feature dependencies go through interfaces, not concrete classes
- [ ] Shared types in a `shared/` or `domain/shared_types/` package (as in HiveArmor)
- [ ] No circular dependencies between packages

### Size & Cohesion
- [ ] No service class > 500 lines (split by responsibility if so)
- [ ] No controller > 200 lines (delegate to service)
- [ ] Package directories have a clear single concern

### Testability
- [ ] Services have constructor injection (not field injection) — enables unit testing
- [ ] No `new` on concrete infrastructure dependencies inside service constructors
- [ ] Domain objects are pure Java (testable without Spring context)

---

## HiveArmor-Specific Architecture Notes

- `backend/src/main/java/com/hivearmor/domain/shared_types/` — shared event/alert types used across services; this is intentional, not a violation
- `backend/src/main/java/com/hivearmor/web/rest/` — 20+ controllers, all should be thin (< 150 lines); delegate to corresponding `service/`
- `backend/src/main/java/com/hivearmor/service/application_events/` — audit/event bus; services publish here, never call it directly from controllers
- Scheduled workers live in `service/` with `@Scheduled` — correct; do not move to controllers
