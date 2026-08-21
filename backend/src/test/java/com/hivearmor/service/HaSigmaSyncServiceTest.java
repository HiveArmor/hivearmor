package com.hivearmor.service;

import com.hivearmor.domain.HaSigmaRule;
import com.hivearmor.repository.HaSigmaRuleRepository;
import com.hivearmor.service.dto.SigmaSyncResultDTO;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.NullSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.test.util.ReflectionTestUtils;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

/**
 * Unit tests for {@link HaSigmaSyncService}.
 *
 * Covers:
 * - Property 3: Sigma rule verbatim storage (detection_yaml holds raw YAML byte-for-byte)
 * - Property 4: Upsert temporal invariants (insert/update timestamp semantics)
 * - Property 5: syncFromGithub processes every matching rule YAML
 * - Property 6: mapSigmaLevel deterministic case-insensitive mapping
 * - Property 7: Air-gap scheduledSync makes no outbound HTTP call
 * - HTTP 500 throws IOException with status in message
 * - Filter finder methods honour predicates
 *
 * Validates: Requirements 2.4, 2.5, 2.6, 2.7, 2.8, 2.10, 2.15
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class HaSigmaSyncServiceTest {

    @Mock
    private HaSigmaRuleRepository sigmaRuleRepository;

    @Mock
    private HttpClient mockHttpClient;

    @Mock
    @SuppressWarnings("rawtypes")
    private HttpResponse mockHttpResponse;

    /** Service under test — use a spy so buildHttpClient() can be stubbed. */
    private HaSigmaSyncService service;

    @BeforeEach
    void setUp() {
        service = spy(new HaSigmaSyncService(sigmaRuleRepository));
    }

    // =========================================================================
    // Property 3: Sigma rule verbatim storage
    // Requirement 2.4 — detection_yaml MUST equal the input YAML byte-for-byte.
    // =========================================================================

    /**
     * **Validates: Requirements 2.4**
     *
     * Property 3: The detection_yaml column MUST contain the input YAML exactly
     * as read from the ZIP entry — no field-map translation, no modification.
     */
    @Test
    void property3_detectionYaml_storedVerbatim() throws Exception {
        String rawYaml =
            "id: test-sigma-id-001\n" +
            "title: Test Rule\n" +
            "status: experimental\n" +
            "logsource:\n" +
            "  product: windows\n" +
            "level: high\n" +
            "detection:\n" +
            "  selection:\n" +
            "    CommandLine|contains: mimikatz\n" +
            "  condition: selection\n";

        byte[] zipBytes = buildZip("sigma-master/rules/windows/test-rule.yml", rawYaml);

        stubHttpSuccess(zipBytes);

        // No existing rule → insert path
        when(sigmaRuleRepository.findBySigmaId("test-sigma-id-001")).thenReturn(Optional.empty());
        when(sigmaRuleRepository.save(any(HaSigmaRule.class)))
            .thenAnswer(inv -> inv.getArgument(0));

        SigmaSyncResultDTO result = service.syncFromGithub();

        ArgumentCaptor<HaSigmaRule> captor = ArgumentCaptor.forClass(HaSigmaRule.class);
        verify(sigmaRuleRepository).save(captor.capture());

        HaSigmaRule saved = captor.getValue();

        // The detection_yaml MUST be identical to the input — no transformation applied.
        assertThat(saved.getDetectionYaml()).isEqualTo(rawYaml);
        // Sanity: the ECS field name "process.command_line" must NOT appear — no fieldmap applied.
        assertThat(saved.getDetectionYaml()).doesNotContain("process.command_line");
        assertThat(result.getProcessed()).isEqualTo(1);
        assertThat(result.getInserted()).isEqualTo(1);
    }

    // =========================================================================
    // Property 4: Upsert temporal invariants
    // Requirement 2.6 (update) and 2.7 (insert)
    // =========================================================================

    /**
     * **Validates: Requirements 2.7**
     *
     * Property 4a: On first insert, imported_at and updated_at are both set to
     * a non-null instant, and active is set to true.
     */
    @Test
    void property4a_insert_setsBothTimestampsAndActive() throws Exception {
        String rawYaml = minimalYaml("sigma-insert-001", "Insert Rule");
        byte[] zipBytes = buildZip("sigma-master/rules/windows/insert.yml", rawYaml);

        stubHttpSuccess(zipBytes);
        when(sigmaRuleRepository.findBySigmaId("sigma-insert-001")).thenReturn(Optional.empty());
        when(sigmaRuleRepository.save(any(HaSigmaRule.class)))
            .thenAnswer(inv -> inv.getArgument(0));

        Instant before = Instant.now();
        service.syncFromGithub();
        Instant after = Instant.now();

        ArgumentCaptor<HaSigmaRule> captor = ArgumentCaptor.forClass(HaSigmaRule.class);
        verify(sigmaRuleRepository).save(captor.capture());
        HaSigmaRule saved = captor.getValue();

        assertThat(saved.getImportedAt()).isNotNull();
        assertThat(saved.getUpdatedAt()).isNotNull();
        assertThat(saved.getActive()).isTrue();

        // Both timestamps should be within the test window
        assertThat(saved.getImportedAt()).isBetween(before, after);
        assertThat(saved.getUpdatedAt()).isBetween(before, after);
    }

    /**
     * **Validates: Requirements 2.6**
     *
     * Property 4b: On upsert (second sync of same sigma_id), imported_at is
     * preserved from the original row; updated_at is set to a new (later) instant.
     */
    @Test
    void property4b_upsert_preservesImportedAt_mutatesUpdatedAt() throws Exception {
        String rawYaml = minimalYaml("sigma-update-002", "Update Rule");
        byte[] zipBytes = buildZip("sigma-master/rules/windows/update.yml", rawYaml);

        stubHttpSuccess(zipBytes);

        // Simulate an existing row with a fixed, older importedAt
        Instant originalImportedAt = Instant.parse("2025-01-01T00:00:00Z");
        Instant originalUpdatedAt  = Instant.parse("2025-01-01T00:00:00Z");

        HaSigmaRule existing = new HaSigmaRule();
        existing.setId(42L);
        existing.setSigmaId("sigma-update-002");
        existing.setRuleTitle("Old Title");
        existing.setImportedAt(originalImportedAt);
        existing.setUpdatedAt(originalUpdatedAt);
        existing.setActive(Boolean.TRUE);
        existing.setDetectionYaml("old yaml");
        existing.setHaSeverity(1);

        when(sigmaRuleRepository.findBySigmaId("sigma-update-002"))
            .thenReturn(Optional.of(existing));
        when(sigmaRuleRepository.save(any(HaSigmaRule.class)))
            .thenAnswer(inv -> inv.getArgument(0));

        Instant syncStart = Instant.now();
        service.syncFromGithub();

        ArgumentCaptor<HaSigmaRule> captor = ArgumentCaptor.forClass(HaSigmaRule.class);
        verify(sigmaRuleRepository).save(captor.capture());
        HaSigmaRule updated = captor.getValue();

        // imported_at MUST be preserved exactly
        assertThat(updated.getImportedAt()).isEqualTo(originalImportedAt);

        // updated_at MUST be newer than the original value and within the test window
        assertThat(updated.getUpdatedAt()).isAfter(originalUpdatedAt);
        assertThat(updated.getUpdatedAt()).isAfterOrEqualTo(syncStart);
    }

    // =========================================================================
    // Property 5: syncFromGithub processes every matching rule YAML
    // Requirement 2.5
    // =========================================================================

    /**
     * **Validates: Requirements 2.5**
     *
     * Property 5a: For N matching ZIP entries (path ends .yml and contains /rules/),
     * processed == N and inserted + updated + errors == N.
     */
    @Test
    void property5a_processesAllMatchingEntries_N3() throws Exception {
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        try (ZipOutputStream zos = new ZipOutputStream(baos)) {
            writeZipEntry(zos, "sigma-master/rules/windows/rule1.yml",
                minimalYaml("id-1", "Rule 1"));
            writeZipEntry(zos, "sigma-master/rules/windows/rule2.yml",
                minimalYaml("id-2", "Rule 2"));
            writeZipEntry(zos, "sigma-master/rules/linux/rule3.yml",
                minimalYaml("id-3", "Rule 3"));
        }

        stubHttpSuccess(baos.toByteArray());
        when(sigmaRuleRepository.findBySigmaId(anyString())).thenReturn(Optional.empty());
        when(sigmaRuleRepository.save(any(HaSigmaRule.class)))
            .thenAnswer(inv -> inv.getArgument(0));

        SigmaSyncResultDTO result = service.syncFromGithub();

        assertThat(result.getProcessed()).isEqualTo(3);
        assertThat(result.getInserted()).isEqualTo(3);
        assertThat(result.getUpdated()).isEqualTo(0);
        assertThat(result.getErrors()).isEqualTo(0);
    }

    /**
     * **Validates: Requirements 2.5**
     *
     * Property 5b: Non-matching entries (no /rules/ in path, or not .yml) are
     * skipped without incrementing the processed counter.
     */
    @Test
    void property5b_nonMatchingEntries_notCounted() throws Exception {
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        try (ZipOutputStream zos = new ZipOutputStream(baos)) {
            // Matching
            writeZipEntry(zos, "sigma-master/rules/windows/good.yml",
                minimalYaml("id-good", "Good Rule"));
            // Non-matching: no /rules/ in path
            writeZipEntry(zos, "sigma-master/config/mapping.yml", "fieldmap:\n  foo: bar\n");
            // Non-matching: wrong extension
            writeZipEntry(zos, "sigma-master/rules/windows/readme.md",
                "# readme");
            // Non-matching: no /rules/ path component
            writeZipEntry(zos, "sigma-master/other/windows/rule.yml",
                minimalYaml("id-skip", "Skipped Rule"));
        }

        stubHttpSuccess(baos.toByteArray());
        when(sigmaRuleRepository.findBySigmaId("id-good")).thenReturn(Optional.empty());
        when(sigmaRuleRepository.save(any(HaSigmaRule.class)))
            .thenAnswer(inv -> inv.getArgument(0));

        SigmaSyncResultDTO result = service.syncFromGithub();

        // Only the one matching entry should be counted
        assertThat(result.getProcessed()).isEqualTo(1);
        assertThat(result.getInserted()).isEqualTo(1);
    }

    /**
     * **Validates: Requirements 2.5**
     *
     * Property 5c: A rule YAML that parses but lacks a 'title' key is not upserted
     * and does not increment inserted/updated counters (only processed is incremented).
     */
    @Test
    void property5c_noTitleKey_notUpserted() throws Exception {
        // Valid YAML but no 'title' key
        String noTitleYaml = "id: no-title-id\nstatus: experimental\n";
        byte[] zipBytes = buildZip("sigma-master/rules/windows/notitle.yml", noTitleYaml);

        stubHttpSuccess(zipBytes);

        SigmaSyncResultDTO result = service.syncFromGithub();

        assertThat(result.getProcessed()).isEqualTo(1);
        assertThat(result.getInserted()).isEqualTo(0);
        assertThat(result.getUpdated()).isEqualTo(0);
        // No save call made
        verify(sigmaRuleRepository, never()).save(any());
    }

    // =========================================================================
    // Property 6: mapSigmaLevel deterministic mapping
    // Requirement 2.8
    // =========================================================================

    /**
     * **Validates: Requirements 2.8**
     *
     * Property 6: Full truth table — critical → 5, high → 4, medium → 3,
     * low → 2, null → 2, any other non-null → 1. Case-insensitive. Idempotent.
     */
    @ParameterizedTest(name = "mapSigmaLevel(\"{0}\") == {1}")
    @CsvSource({
        // canonical lowercase
        "critical, 5",
        "high,     4",
        "medium,   3",
        "low,      2",
        // unknown → 1
        "informational, 1",
        "unknown,       1",
        "other,         1",
    })
    void property6_mapSigmaLevel_knownLevels(String level, int expected) {
        assertThat(service.mapSigmaLevel(level)).isEqualTo(expected);
    }

    /**
     * Empty string (not null) is not a recognised level → returns 1.
     */
    @Test
    void property6_mapSigmaLevel_emptyString_returns1() {
        assertThat(service.mapSigmaLevel("")).isEqualTo(1);
    }

    @Test
    void property6_mapSigmaLevel_nullInput_returns2() {
        assertThat(service.mapSigmaLevel(null)).isEqualTo(2);
    }

    /**
     * Case-insensitive variants for critical/high/medium/low.
     */
    @ParameterizedTest(name = "mapSigmaLevel(\"{0}\") == {1} [case-insensitive]")
    @CsvSource({
        "CRITICAL, 5",
        "Critical, 5",
        "HIGH,     4",
        "High,     4",
        "MEDIUM,   3",
        "Medium,   3",
        "LOW,      2",
        "Low,      2",
    })
    void property6_mapSigmaLevel_caseInsensitive(String level, int expected) {
        assertThat(service.mapSigmaLevel(level)).isEqualTo(expected);
    }

    /**
     * Idempotency: calling mapSigmaLevel twice with the same input returns
     * the same result (no mutable state).
     */
    @ParameterizedTest
    @ValueSource(strings = {"critical", "high", "medium", "low", "unknown"})
    void property6_mapSigmaLevel_idempotent(String level) {
        int first  = service.mapSigmaLevel(level);
        int second = service.mapSigmaLevel(level);
        assertThat(first).isEqualTo(second);
    }

    // =========================================================================
    // Property 7: Air-gap scheduledSync makes no outbound call
    // Requirement 2.10
    // =========================================================================

    /**
     * **Validates: Requirements 2.10**
     *
     * Property 7: With app.air-gap=true, scheduledSync() MUST NOT call
     * buildHttpClient(), MUST NOT make any HTTP send invocation, and MUST NOT
     * mutate any rows in the repository.
     */
    @Test
    void property7_airGap_scheduledSync_makesNoOutboundCall() throws Exception {
        // Set airGap=true via reflection (it's @Value-injected, no arg in constructor)
        ReflectionTestUtils.setField(service, "airGap", true);

        // Ensure the spy does NOT delegate to the real buildHttpClient
        // (calling it would normally construct a real HttpClient)
        doReturn(mockHttpClient).when(service).buildHttpClient();

        service.scheduledSync();

        // buildHttpClient() MUST NOT have been called
        verify(service, never()).buildHttpClient();

        // The mock HttpClient's send() MUST NOT have been invoked
        verify(mockHttpClient, never()).send(any(HttpRequest.class), any());

        // No repository mutations
        verify(sigmaRuleRepository, never()).save(any());
        verify(sigmaRuleRepository, never()).findBySigmaId(anyString());
    }

    /**
     * **Validates: Requirements 2.10**
     *
     * When air-gap is false, scheduledSync does invoke syncFromGithub and
     * proceeds to build the HttpClient (confirming the guard works both ways).
     */
    @Test
    void airGap_false_scheduledSync_invokesSync() throws Exception {
        ReflectionTestUtils.setField(service, "airGap", false);

        // Stub syncFromGithub so it doesn't make a real HTTP call
        doReturn(new SigmaSyncResultDTO(0, 0, 0, 0))
            .when(service).syncFromGithub();

        service.scheduledSync();

        verify(service, times(1)).syncFromGithub();
    }

    // =========================================================================
    // HTTP 500 raises IOException whose message includes status
    // Requirement 2.15
    // =========================================================================

    /**
     * **Validates: Requirements 2.15**
     *
     * When the SigmaHQ archive download returns HTTP 500, syncFromGithub MUST
     * throw a checked IOException whose message contains the status code "500".
     */
    @Test
    @SuppressWarnings("unchecked")
    void http500_throwsIOException_withStatusInMessage() throws Exception {
        doReturn(mockHttpClient).when(service).buildHttpClient();

        when(mockHttpClient.send(any(HttpRequest.class), any()))
            .thenReturn(mockHttpResponse);
        when(mockHttpResponse.statusCode()).thenReturn(500);

        assertThatThrownBy(() -> service.syncFromGithub())
            .isInstanceOf(IOException.class)
            .hasMessageContaining("500");
    }

    /**
     * Variant: HTTP 404 also raises IOException with "404" in message.
     */
    @Test
    @SuppressWarnings("unchecked")
    void http404_throwsIOException_withStatusInMessage() throws Exception {
        doReturn(mockHttpClient).when(service).buildHttpClient();

        when(mockHttpClient.send(any(HttpRequest.class), any()))
            .thenReturn(mockHttpResponse);
        when(mockHttpResponse.statusCode()).thenReturn(404);

        assertThatThrownBy(() -> service.syncFromGithub())
            .isInstanceOf(IOException.class)
            .hasMessageContaining("404");
    }

    // =========================================================================
    // Filter finder methods honour predicates
    // Requirement 2.3 / 2.14
    // =========================================================================

    /**
     * **Validates: Requirements 2.3, 2.14**
     *
     * findByLogsourceProduct returns only rules whose logsource_product matches
     * the supplied product string.
     */
    @Test
    void finderByProduct_honoursPredicate() {
        HaSigmaRule rule = buildRule("id-win", "Windows Rule", "windows");
        Page<HaSigmaRule> page = new PageImpl<>(List.of(rule));
        Pageable pageable = PageRequest.of(0, 25);

        when(sigmaRuleRepository.findByLogsourceProduct("windows", pageable))
            .thenReturn(page);

        Page<HaSigmaRule> result =
            sigmaRuleRepository.findByLogsourceProduct("windows", pageable);

        assertThat(result.getContent()).hasSize(1);
        assertThat(result.getContent().get(0).getLogsourceProduct()).isEqualTo("windows");
    }

    /**
     * **Validates: Requirements 2.3, 2.14**
     *
     * findByHaSeverityGreaterThanEqual returns only rules whose ha_severity >= minSeverity.
     */
    @Test
    void finderBySeverity_honoursPredicate() {
        HaSigmaRule highRule    = buildRule("id-high",    "High Rule",    "windows");
        highRule.setHaSeverity(4);
        HaSigmaRule criticalRule = buildRule("id-critical", "Critical Rule", "windows");
        criticalRule.setHaSeverity(5);

        Pageable pageable = PageRequest.of(0, 25);
        Page<HaSigmaRule> page = new PageImpl<>(List.of(highRule, criticalRule));

        when(sigmaRuleRepository.findByHaSeverityGreaterThanEqual(4, pageable))
            .thenReturn(page);

        Page<HaSigmaRule> result =
            sigmaRuleRepository.findByHaSeverityGreaterThanEqual(4, pageable);

        assertThat(result.getContent()).hasSize(2);
        result.getContent().forEach(r ->
            assertThat(r.getHaSeverity()).isGreaterThanOrEqualTo(4));
    }

    /**
     * **Validates: Requirements 2.3, 2.14**
     *
     * findByLogsourceProductAndHaSeverityGreaterThanEqual honours both predicates.
     */
    @Test
    void finderByProductAndSeverity_honoursBothPredicates() {
        HaSigmaRule rule = buildRule("id-combo", "Combo Rule", "linux");
        rule.setHaSeverity(3);

        Pageable pageable = PageRequest.of(0, 25);
        Page<HaSigmaRule> page = new PageImpl<>(List.of(rule));

        when(sigmaRuleRepository
            .findByLogsourceProductAndHaSeverityGreaterThanEqual("linux", 3, pageable))
            .thenReturn(page);

        Page<HaSigmaRule> result =
            sigmaRuleRepository
                .findByLogsourceProductAndHaSeverityGreaterThanEqual("linux", 3, pageable);

        assertThat(result.getContent()).hasSize(1);
        assertThat(result.getContent().get(0).getLogsourceProduct()).isEqualTo("linux");
        assertThat(result.getContent().get(0).getHaSeverity()).isGreaterThanOrEqualTo(3);
    }

    // =========================================================================
    // isAirGap() test seam
    // =========================================================================

    @Test
    void isAirGap_returnsFalseByDefault() {
        // airGap defaults to false (no @Value injection in unit test context)
        assertThat(service.isAirGap()).isFalse();
    }

    @Test
    void isAirGap_returnsTrueWhenSetViaReflection() {
        ReflectionTestUtils.setField(service, "airGap", true);
        assertThat(service.isAirGap()).isTrue();
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    /**
     * Builds a minimal but valid Sigma YAML string with the given id and title.
     * Includes logsource.product so logsourceProduct is populated on the saved entity.
     */
    private String minimalYaml(String id, String title) {
        return "id: " + id + "\n" +
               "title: " + title + "\n" +
               "status: experimental\n" +
               "logsource:\n" +
               "  product: windows\n" +
               "level: high\n" +
               "detection:\n" +
               "  selection:\n" +
               "    EventID: 4624\n" +
               "  condition: selection\n";
    }

    /**
     * Builds an in-memory ZIP with a single entry at the given path containing
     * the given content (UTF-8).
     */
    private byte[] buildZip(String entryPath, String content) throws IOException {
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        try (ZipOutputStream zos = new ZipOutputStream(baos)) {
            writeZipEntry(zos, entryPath, content);
        }
        return baos.toByteArray();
    }

    /** Writes a single entry into the already-open ZipOutputStream. */
    private void writeZipEntry(ZipOutputStream zos, String path, String content)
            throws IOException {
        zos.putNextEntry(new ZipEntry(path));
        zos.write(content.getBytes(StandardCharsets.UTF_8));
        zos.closeEntry();
    }

    /**
     * Stubs the spy's buildHttpClient() to return the mock, and configures the mock
     * to return HTTP 200 with the supplied ZIP bytes as the response body.
     */
    @SuppressWarnings("unchecked")
    private void stubHttpSuccess(byte[] zipBytes) throws IOException, InterruptedException {
        doReturn(mockHttpClient).when(service).buildHttpClient();

        when(mockHttpClient.send(any(HttpRequest.class), any()))
            .thenReturn(mockHttpResponse);
        when(mockHttpResponse.statusCode()).thenReturn(200);
        when(mockHttpResponse.body())
            .thenReturn(new ByteArrayInputStream(zipBytes));
    }

    /** Builds a minimal {@link HaSigmaRule} suitable for finder-predicate tests. */
    private HaSigmaRule buildRule(String sigmaId, String title, String product) {
        HaSigmaRule rule = new HaSigmaRule();
        rule.setSigmaId(sigmaId);
        rule.setRuleTitle(title);
        rule.setLogsourceProduct(product);
        rule.setDetectionYaml("detection_yaml: placeholder");
        rule.setHaSeverity(2);
        rule.setActive(Boolean.TRUE);
        rule.setImportedAt(Instant.now());
        rule.setUpdatedAt(Instant.now());
        return rule;
    }
}
