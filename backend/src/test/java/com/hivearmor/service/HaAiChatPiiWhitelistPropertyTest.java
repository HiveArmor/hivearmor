package com.hivearmor.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import net.jqwik.api.*;
import net.jqwik.api.lifecycle.BeforeTry;

import java.util.*;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

/**
 * Property 3: PII whitelist subset invariant.
 *
 * <p><strong>Property 3: PII whitelist subset invariant</strong><br>
 * For any raw alert or incident document (including random payloads containing
 * credentials, tokens, and PII), the top-level key set of the JSON returned by
 * {@code loadAlertAsJson} / {@code loadIncidentAsJson} is a subset of the
 * respective whitelist, or the returned value is {@code null}.
 *
 * <p><strong>Validates: Requirements 4.2, 4.5, 4.7</strong>
 */
@Label("Feature: sprint-25-ai-chat, Property 3: PII whitelist subset invariant")
class HaAiChatPiiWhitelistPropertyTest {

    /**
     * Mirror of {@link HaAlertContextService#ALERT_WHITELIST} — kept in sync by design;
     * divergence would itself be a test failure (compilation error on the field reference
     * would surface the mismatch at build time if the set were public).
     */
    private static final Set<String> ALERT_WHITELIST = Set.of(
        "id", "name", "category", "severity", "description",
        "dataType", "mitreTactic", "mitreTechnique",
        "source", "destination", "timestamp"
    );

    private static final Set<String> INCIDENT_WHITELIST = Set.of(
        "id", "incidentName", "incidentStatus", "incidentSeverity", "incidentObservations"
    );

    /**
     * PII-like / credential keys that must NEVER appear in any service output,
     * regardless of whether they are in the raw source document.
     */
    private static final List<String> SENSITIVE_KEYS = List.of(
        "password", "token", "secret", "apiKey", "ssn",
        "creditCard", "rawLog", "_source", "email", "phoneNumber",
        "privateKey", "bearerToken", "authToken", "sessionId"
    );

    private final ObjectMapper objectMapper = new ObjectMapper().findAndRegisterModules();

    // =========================================================================
    // Mocks — re-created fresh for every jqwik trial via @BeforeTry
    // =========================================================================

    private AlertQueryPort mockAlertPort;
    private IncidentQueryPort mockIncidentPort;

    @BeforeTry
    void setUp() {
        mockAlertPort = mock(AlertQueryPort.class);
        mockIncidentPort = mock(IncidentQueryPort.class);
    }

    // =========================================================================
    // Property 3-A: alert whitelist subset
    // =========================================================================

    /**
     * For any raw map passed to {@code loadAlertAsJson}, the returned JSON keys
     * are a subset of {@code ALERT_WHITELIST}, or the result is {@code null}.
     *
     * <p><strong>Validates: Requirements 4.2, 4.5, 4.7</strong>
     */
    @Property(tries = 200)
    @Label("Property 3-A: alert context keys are subset of ALERT_WHITELIST")
    void property3a_alertContextKeysSubsetOfWhitelist(
            @ForAll("arbitraryStringMaps") Map<String, Object> rawAlert) throws Exception {

        when(mockAlertPort.findById(anyString())).thenReturn(rawAlert);

        HaAlertContextService sut = new HaAlertContextService(mockAlertPort, objectMapper);
        String json = sut.loadAlertAsJson("test-alert-id");

        if (json == null) {
            // null is always acceptable per Requirement 4.7
            return;
        }

        @SuppressWarnings("unchecked")
        Map<String, Object> parsed = objectMapper.readValue(json, Map.class);

        assertThat(ALERT_WHITELIST)
            .as("All returned keys must be members of ALERT_WHITELIST. Actual returned keys: %s",
                parsed.keySet())
            .containsAll(parsed.keySet());
    }

    // =========================================================================
    // Property 3-A2: PII keys absent from alert context JSON
    // =========================================================================

    /**
     * Even when the raw map contains PII-like keys (password, token, ssn, etc.),
     * those keys must be absent from the returned JSON.
     *
     * <p><strong>Validates: Requirements 4.2, 4.5</strong>
     */
    @Property(tries = 100)
    @Label("Property 3-A2: PII keys never appear in alert context JSON")
    void property3a2_piiKeysNeverInAlertContextJson(
            @ForAll("piiContaminatedAlertMaps") Map<String, Object> rawAlert) throws Exception {

        when(mockAlertPort.findById(anyString())).thenReturn(rawAlert);

        HaAlertContextService sut = new HaAlertContextService(mockAlertPort, objectMapper);
        String json = sut.loadAlertAsJson("alert-pii-test");

        if (json == null) {
            return;
        }

        @SuppressWarnings("unchecked")
        Map<String, Object> parsed = objectMapper.readValue(json, Map.class);

        assertThat(parsed.keySet())
            .as("PII-like keys must never appear in alert context JSON")
            .doesNotContainAnyElementsOf(SENSITIVE_KEYS);
    }

    // =========================================================================
    // Property 3-B: incident whitelist subset
    // =========================================================================

    /**
     * For any raw map passed to {@code loadIncidentAsJson}, the returned JSON keys
     * are a subset of {@code INCIDENT_WHITELIST}, or the result is {@code null}.
     *
     * <p><strong>Validates: Requirements 4.2, 4.5, 4.7</strong>
     */
    @Property(tries = 200)
    @Label("Property 3-B: incident context keys are subset of INCIDENT_WHITELIST")
    void property3b_incidentContextKeysSubsetOfWhitelist(
            @ForAll("arbitraryStringMaps") Map<String, Object> rawIncident) throws Exception {

        when(mockIncidentPort.findById(anyString())).thenReturn(rawIncident);

        HaIncidentContextService sut = new HaIncidentContextService(mockIncidentPort, objectMapper);
        String json = sut.loadIncidentAsJson("test-incident-id");

        if (json == null) {
            return;
        }

        @SuppressWarnings("unchecked")
        Map<String, Object> parsed = objectMapper.readValue(json, Map.class);

        assertThat(INCIDENT_WHITELIST)
            .as("All returned keys must be members of INCIDENT_WHITELIST. Actual returned keys: %s",
                parsed.keySet())
            .containsAll(parsed.keySet());
    }

    // =========================================================================
    // Property 3-B2: PII keys absent from incident context JSON
    // =========================================================================

    /**
     * Even when the raw incident map contains PII-like keys those keys must be
     * absent from the returned JSON.
     *
     * <p><strong>Validates: Requirements 4.2, 4.5</strong>
     */
    @Property(tries = 100)
    @Label("Property 3-B2: PII keys never appear in incident context JSON")
    void property3b2_piiKeysNeverInIncidentContextJson(
            @ForAll("piiContaminatedIncidentMaps") Map<String, Object> rawIncident) throws Exception {

        when(mockIncidentPort.findById(anyString())).thenReturn(rawIncident);

        HaIncidentContextService sut = new HaIncidentContextService(mockIncidentPort, objectMapper);
        String json = sut.loadIncidentAsJson("incident-pii-test");

        if (json == null) {
            return;
        }

        @SuppressWarnings("unchecked")
        Map<String, Object> parsed = objectMapper.readValue(json, Map.class);

        assertThat(parsed.keySet())
            .as("PII-like keys must never appear in incident context JSON")
            .doesNotContainAnyElementsOf(SENSITIVE_KEYS);
    }

    // =========================================================================
    // Property 3-C: null / empty source → null output (no exception)
    // =========================================================================

    /**
     * When the port returns {@code null} or an empty map, both services return
     * {@code null} without throwing.
     *
     * <p><strong>Validates: Requirement 4.7</strong>
     */
    @Property(tries = 20)
    @Label("Property 3-C: null or empty source returns null, no exception")
    void property3c_nullOrEmptySource_returnsNull() {
        when(mockAlertPort.findById(anyString())).thenReturn(null);
        when(mockIncidentPort.findById(anyString())).thenReturn(null);

        HaAlertContextService alertSvc =
            new HaAlertContextService(mockAlertPort, objectMapper);
        HaIncidentContextService incidentSvc =
            new HaIncidentContextService(mockIncidentPort, objectMapper);

        assertThat(alertSvc.loadAlertAsJson("any")).isNull();
        assertThat(incidentSvc.loadIncidentAsJson("any")).isNull();

        // Also test empty map — same contract
        AlertQueryPort emptyAlertPort = mock(AlertQueryPort.class);
        when(emptyAlertPort.findById(anyString())).thenReturn(Map.of());
        IncidentQueryPort emptyIncidentPort = mock(IncidentQueryPort.class);
        when(emptyIncidentPort.findById(anyString())).thenReturn(Map.of());

        assertThat(new HaAlertContextService(emptyAlertPort, objectMapper)
            .loadAlertAsJson("any")).isNull();
        assertThat(new HaIncidentContextService(emptyIncidentPort, objectMapper)
            .loadIncidentAsJson("any")).isNull();
    }

    // =========================================================================
    // Property 3-D: port exception → null output (no exception propagation)
    // =========================================================================

    /**
     * When the port throws any {@code RuntimeException}, both services swallow it
     * and return {@code null} — they must never propagate the exception to callers.
     *
     * <p><strong>Validates: Requirement 4.7</strong>
     */
    @Property(tries = 50)
    @Label("Property 3-D: port exception returns null, no exception propagation")
    void property3d_portException_returnsNull(
            @ForAll("arbitraryRuntimeExceptions") RuntimeException thrown) {

        when(mockAlertPort.findById(anyString())).thenThrow(thrown);
        when(mockIncidentPort.findById(anyString())).thenThrow(thrown);

        HaAlertContextService alertSvc =
            new HaAlertContextService(mockAlertPort, objectMapper);
        HaIncidentContextService incidentSvc =
            new HaIncidentContextService(mockIncidentPort, objectMapper);

        // Must not throw — return null silently
        assertThat(alertSvc.loadAlertAsJson("any")).isNull();
        assertThat(incidentSvc.loadIncidentAsJson("any")).isNull();
    }

    // =========================================================================
    // Property 3-E: only-whitelist-key maps produce non-null JSON
    // =========================================================================

    /**
     * When the raw source contains only keys from the whitelist (at least one),
     * the service must return non-null JSON containing exactly those whitelisted keys.
     *
     * <p><strong>Validates: Requirements 4.2, 4.5</strong>
     */
    @Property(tries = 100)
    @Label("Property 3-E: map with only whitelist keys produces non-null JSON with those keys")
    void property3e_whitelistOnlyMap_producesNonNullJson(
            @ForAll("alertWhitelistOnlyMaps") Map<String, Object> whitelistMap)
            throws Exception {

        when(mockAlertPort.findById(anyString())).thenReturn(whitelistMap);

        HaAlertContextService sut = new HaAlertContextService(mockAlertPort, objectMapper);
        String json = sut.loadAlertAsJson("whitelist-only");

        // Map has at least one whitelisted key with a non-null value → must not be null
        assertThat(json)
            .as("A map with only whitelist keys must produce non-null JSON")
            .isNotNull();

        @SuppressWarnings("unchecked")
        Map<String, Object> parsed = objectMapper.readValue(json, Map.class);

        // All returned keys must be in the whitelist
        assertThat(ALERT_WHITELIST)
            .as("Returned keys must be a subset of ALERT_WHITELIST")
            .containsAll(parsed.keySet());

        // All parsed keys must be present in the original input
        assertThat(whitelistMap.keySet())
            .as("Every returned key must have been present in the source")
            .containsAll(parsed.keySet());
    }

    // =========================================================================
    // Arbitrary providers
    // =========================================================================

    /**
     * Arbitrary {@code Map<String, Object>} with fully random string keys (may
     * include PII-like names, whitelist names, or anything else) and string values.
     */
    @Provide
    Arbitrary<Map<String, Object>> arbitraryStringMaps() {
        Arbitrary<String> keys = Arbitraries.strings().alpha().ofMinLength(1).ofMaxLength(30);
        Arbitrary<String> values = Arbitraries.strings().ofMinLength(0).ofMaxLength(100);
        return Arbitraries.maps(keys, values)
            .ofMinSize(0)
            .ofMaxSize(20)
            .map(LinkedHashMap::new);
    }

    /**
     * Maps that always include valid whitelist keys mixed with a variety of
     * PII-like / credential keys.
     */
    @Provide
    Arbitrary<Map<String, Object>> piiContaminatedAlertMaps() {
        return Arbitraries.just(null).map(ignored -> {
            Map<String, Object> map = new LinkedHashMap<>();
            // Valid whitelisted fields
            map.put("id", "alert-123");
            map.put("name", "Test Alert");
            map.put("severity", "high");
            map.put("category", "malware");
            // PII / sensitive fields — must never leak through
            map.put("password", "s3cr3t!");
            map.put("token", "eyJhbGciOiJIUzI1NiJ9.xxx");
            map.put("secret", "api-key-value");
            map.put("apiKey", "sk-xxxx");
            map.put("ssn", "123-45-6789");
            map.put("creditCard", "4111111111111111");
            map.put("rawLog", "raw log payload with credentials");
            map.put("_source", "{\"password\": \"exposed\"}");
            map.put("email", "user@example.com");
            map.put("phoneNumber", "+1-555-0100");
            map.put("privateKey", "-----BEGIN RSA PRIVATE KEY-----");
            map.put("bearerToken", "Bearer supersecret");
            return map;
        });
    }

    /**
     * Maps that always include valid incident whitelist keys mixed with PII-like keys.
     */
    @Provide
    Arbitrary<Map<String, Object>> piiContaminatedIncidentMaps() {
        return Arbitraries.just(null).map(ignored -> {
            Map<String, Object> map = new LinkedHashMap<>();
            // Valid whitelisted fields
            map.put("id", "INC-42");
            map.put("incidentName", "Ransomware Campaign");
            map.put("incidentStatus", "open");
            map.put("incidentSeverity", "critical");
            // PII / sensitive fields — must never leak through
            map.put("password", "admin123");
            map.put("token", "ghp_xxxxxxxxxxxx");
            map.put("apiKey", "sk-prod-xxxxxxxx");
            map.put("ssn", "987-65-4321");
            map.put("creditCard", "5500005555555559");
            map.put("rawLog", "raw syslog with user credentials");
            map.put("_source", "{\"apiKey\": \"exposed\"}");
            map.put("email", "analyst@org.com");
            map.put("sessionId", "sess_abc123def456");
            return map;
        });
    }

    /**
     * Maps containing only valid alert whitelist keys, each with a non-null,
     * non-blank string value — guarantees the service returns a non-null JSON string.
     */
    @Provide
    Arbitrary<Map<String, Object>> alertWhitelistOnlyMaps() {
        List<String> keys = new ArrayList<>(ALERT_WHITELIST);
        // Generate a non-empty subset of whitelist keys
        return Arbitraries.subsetOf(keys)
            .filter(subset -> !subset.isEmpty())
            .map(subset -> {
                Map<String, Object> map = new LinkedHashMap<>();
                for (String k : subset) {
                    map.put(k, "value-for-" + k);
                }
                return map;
            });
    }

    /**
     * Arbitrary {@code RuntimeException} instances with varied messages to simulate
     * diverse failure modes from the underlying query port.
     */
    @Provide
    Arbitrary<RuntimeException> arbitraryRuntimeExceptions() {
        return Arbitraries.of(
            new RuntimeException("connection timeout"),
            new RuntimeException("index not found"),
            new IllegalStateException("unexpected state"),
            new NullPointerException("null field in document"),
            new UnsupportedOperationException("not supported")
        );
    }
}
