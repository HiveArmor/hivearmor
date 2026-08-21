---
name: test-quality
description: Java test quality — JUnit 5 + AssertJ patterns, Arrange-Act-Assert, parameterized tests, soft assertions, coverage priorities. Triggered by "add tests", "improve coverage", "write unit tests", "test quality".
---

# Test Quality Skill

Write readable, maintainable tests using **JUnit 5 + AssertJ**.

## Philosophy

Tests verify **behavior**, not implementation details. A test that passes after you change implementation details is testing the right thing.

## Setup

```java
import org.junit.jupiter.api.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.*;
import static org.assertj.core.api.Assertions.*;
import static org.assertj.core.api.SoftAssertions.assertSoftly;
```

---

## 1. AssertJ Over JUnit Assertions

```java
// ❌ JUnit assertions — poor failure messages
assertEquals(3, plugins.size());
assertTrue(plugins.contains("alerts"));

// ✅ AssertJ — descriptive failure: "Expected List to have size 3 but was 2. Missing: [soc-ai]"
assertThat(plugins)
    .hasSize(3)
    .extracting(Plugin::getId)
    .containsExactlyInAnyOrder("alerts", "feeds", "soc-ai");
```

### AssertJ Patterns for HiveArmor Types

```java
// Alert assertions
assertThat(alert)
    .extracting(Alert::getSeverity, Alert::getStatus)
    .containsExactly(Severity.HIGH, AlertStatus.OPEN);

// Response entity
assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
assertThat(response.getBody()).isNotNull()
    .extracting(AlertDTO::getId).isEqualTo(alertId);

// Optional
assertThat(service.findById(id))
    .isPresent()
    .get()
    .extracting(Alert::getSeverity)
    .isEqualTo(Severity.CRITICAL);

// List operations
assertThat(alerts)
    .filteredOn(a -> a.getSeverity() == Severity.CRITICAL)
    .hasSizeGreaterThan(0)
    .allMatch(a -> a.getStatus() != AlertStatus.CLOSED);
```

---

## 2. Arrange-Act-Assert Pattern

```java
@Test
@DisplayName("should tag alert as suppressed when rule matches")
void shouldTagAlertAsSuppressed_whenRuleMatches() {
    // Arrange
    Alert alert = AlertBuilder.anAlert()
        .withSeverity(Severity.LOW)
        .withSource("backup-server")
        .build();
    TaggingRule rule = new SuppressionRule("backup-server", Severity.LOW);

    // Act
    AlertTag result = taggingService.evaluate(alert, rule);

    // Assert
    assertThat(result).isEqualTo(AlertTag.SUPPRESSED);
}
```

**One concept per test.** If you need `and` in the test name, split into two tests.

---

## 3. Exception Testing

```java
// ✅ AssertJ exception assertions
assertThatThrownBy(() -> pluginLoader.load(invalidPath))
    .isInstanceOf(PluginException.class)
    .hasMessageContaining("Invalid plugin descriptor")
    .hasCauseInstanceOf(IOException.class);

// ✅ For expected exception type only
assertThatExceptionOfType(PluginException.class)
    .isThrownBy(() -> pluginLoader.load(invalidPath))
    .withMessageContaining("descriptor");
```

---

## 4. Parameterized Tests

```java
// ✅ Reduce duplication for multiple inputs
@ParameterizedTest
@DisplayName("should classify severity correctly")
@CsvSource({
    "9, CRITICAL",
    "7, HIGH",
    "4, MEDIUM",
    "1, LOW",
})
void shouldClassifySeverity(int score, Severity expected) {
    assertThat(SeverityClassifier.classify(score)).isEqualTo(expected);
}

// ✅ Method source for complex objects
@ParameterizedTest
@MethodSource("provideAlertScenarios")
void shouldProcessAlert(Alert input, AlertStatus expectedStatus) {
    assertThat(processor.process(input).getStatus()).isEqualTo(expectedStatus);
}

static Stream<Arguments> provideAlertScenarios() {
    return Stream.of(
        Arguments.of(criticalAlert(), AlertStatus.OPEN),
        Arguments.of(suppressedAlert(), AlertStatus.SUPPRESSED)
    );
}
```

---

## 5. Soft Assertions

Use when multiple independent properties need checking — all assertions run even if one fails.

```java
@Test
void shouldReturnCompleteAlertDTO() {
    AlertDTO dto = mapper.toDTO(alert);

    assertSoftly(softly -> {
        softly.assertThat(dto.getId()).isNotNull();
        softly.assertThat(dto.getSeverity()).isEqualTo("CRITICAL");
        softly.assertThat(dto.getTimestamp()).isNotNull();
        softly.assertThat(dto.getSource()).isEqualTo("firewall-01");
        softly.assertThat(dto.getMitreTechnique()).startsWith("T");
    });
    // Reports ALL failures at once, not just the first
}
```

---

## 6. Test Structure with @Nested

```java
@DisplayName("AlertTaggingService")
class AlertTaggingServiceTest {

    @Nested
    @DisplayName("when alert severity is CRITICAL")
    class WhenCritical {
        @Test void shouldNeverSuppress() { ... }
        @Test void shouldAlwaysCreateIncident() { ... }
    }

    @Nested
    @DisplayName("when suppression rule matches")
    class WhenSuppressed {
        @Test void shouldTagAsSuppressed() { ... }
        @Test void shouldNotCreateIncident() { ... }
    }
}
```

---

## 7. Test Builders (HiveArmor)

```java
// Create reusable test builders for domain objects
public class AlertBuilder {
    private Severity severity = Severity.MEDIUM;
    private AlertStatus status = AlertStatus.OPEN;
    private String source = "test-source";

    public static AlertBuilder anAlert() { return new AlertBuilder(); }

    public AlertBuilder withSeverity(Severity s) { this.severity = s; return this; }
    public AlertBuilder withStatus(AlertStatus s) { this.status = s; return this; }
    public AlertBuilder withSource(String src) { this.source = src; return this; }

    public Alert build() {
        Alert a = new Alert();
        a.setSeverity(severity);
        a.setStatus(status);
        a.setSource(source);
        return a;
    }
}
```

---

## Coverage Priorities

| Priority | What to test |
|---|---|
| ✅ Must | Public service methods, business logic, error/exception paths |
| ✅ Must | Alert status transitions, rule evaluation, severity classification |
| ✅ Must | REST controller request/response validation |
| ⚠️ When complex | OpenSearch query builders, event processor pipeline |
| ❌ Skip | Trivial getters/setters, simple DTOs, framework-generated code |
| ❌ Skip | Database entity mappings (covered by integration tests) |

## Integration Tests

```java
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Testcontainers
class AlertServiceIntegrationTest {

    @Container
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16");

    @Test
    void shouldPersistAndRetrieveAlert() { ... }
}
```
