---
name: spring-data-jpa
description: Spring Data JPA patterns — N+1 prevention, projections, pagination, batch inserts, Liquibase migrations. Use for all PostgreSQL entity and repository work in the HiveArmor backend.
metadata:
  type: skill
  source: rrezartprebreza/spring-boot-skills + decebals/Codex-java (adapted)
---

# Spring Data JPA + Liquibase — HiveArmor Backend

## Project Context
- Database: PostgreSQL `hivearmor` on port 5438
- Schema managed by Liquibase — changelogs in `backend/src/main/resources/config/liquibase/changelog/`
- Master file: `master.xml` — includes must be in strict date order
- Spring Data JPA repositories in `com.hivearmor.repository.*`

## N+1 Prevention — Use Fetch Joins
```java
// BAD — N+1 queries when accessing alert.tags
@Query("SELECT a FROM Alert a")
List<Alert> findAll();

// GOOD — single JOIN FETCH
@Query("SELECT DISTINCT a FROM Alert a LEFT JOIN FETCH a.tags WHERE a.status = :status")
List<Alert> findByStatusWithTags(@Param("status") AlertStatus status);

// For paginated results — use @EntityGraph (avoid JOIN FETCH + Pageable)
@EntityGraph(attributePaths = {"tags", "assignee"})
Page<Alert> findByStatus(AlertStatus status, Pageable pageable);
```

## Projections — Use for List Views (avoid loading full entities)
```java
// Define interface projection
public interface AlertSummary {
    Long getId();
    String getSeverity();
    String getStatus();
    Instant getCreatedAt();
    String getSource();
}

// Repository returns projections
List<AlertSummary> findBySeverityOrderByCreatedAtDesc(String severity);
```

## Keyset Pagination (for high-volume alert/log queries)
```java
// Offset pagination fails at page 1000+ on large tables
// Use keyset (cursor) pagination instead

@Query("SELECT a FROM Alert a WHERE a.createdAt < :cursor ORDER BY a.createdAt DESC")
List<Alert> findBeforeCursor(@Param("cursor") Instant cursor, Pageable pageable);
```

## Batch Insert (for bulk alert writes from event processor)
```java
@Repository
public class AlertBatchRepository {
    
    @PersistenceContext
    private EntityManager em;

    @Transactional
    public void batchInsert(List<Alert> alerts) {
        for (int i = 0; i < alerts.size(); i++) {
            em.persist(alerts.get(i));
            if (i % 50 == 0) {  // flush and clear every 50
                em.flush();
                em.clear();
            }
        }
    }
}
```
Also set in `application.yml`:
```yaml
spring.jpa.properties.hibernate.jdbc.batch_size: 50
spring.jpa.properties.hibernate.order_inserts: true
```

## Liquibase Migration Rules (from AGENTS.md)
```xml
<!-- File: YYYYMMDDNNN_description.xml — e.g. 20260715001_add_alert_tags.xml -->
<databaseChangeLog xmlns="http://www.liquibase.org/xml/ns/dbchangelog" ...>
    
    <changeSet id="20260715001" author="hivearmor">
        <!-- New columns MUST have defaultValue or nullable="true" -->
        <addColumn tableName="utm_alert">
            <column name="mitre_tactic" type="varchar(100)" defaultValue="unknown"/>
        </addColumn>
    </changeSet>

</databaseChangeLog>
```

**Hard rules:**
- Never edit a shipped changeset — only add new ones
- No `DROP COLUMN` or `RENAME COLUMN` without 2-release deprecation cycle
- Always run `mvn -s settings.xml liquibase:validate` before merging
- Include in `master.xml` in strict date order

## Transactional Patterns
```java
// Read-only queries — reduces lock contention
@Transactional(readOnly = true)
public List<AlertSummary> getAlertSummaries(AlertFilter filter) { ... }

// Write operations — default propagation
@Transactional
public Alert updateStatus(Long id, AlertStatus newStatus) { ... }

// Avoid self-invocation (bypasses proxy)
// BAD: calling @Transactional method from within the same class
// GOOD: inject the service into itself or extract to a helper class
```
