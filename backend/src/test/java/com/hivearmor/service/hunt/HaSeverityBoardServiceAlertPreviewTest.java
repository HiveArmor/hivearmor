package com.hivearmor.service.hunt;

import com.hivearmor.service.hunt.dto.AlertPreview;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Unit tests for {@link HaSeverityBoardService} Task 1.4:
 * mapping top_hits source documents to {@link AlertPreview} records.
 *
 * <p>Sprint 37 — ALT-023 (Task 1.4).
 */
class HaSeverityBoardServiceAlertPreviewTest {

    // =========================================================================
    // parseAlertPreview — full document mapping
    // =========================================================================

    @Nested
    @DisplayName("parseAlertPreview")
    class ParseAlertPreviewTests {

        @Test
        @DisplayName("maps fully populated source document to AlertPreview")
        void parseAlertPreview_fullDocument() {
            Map<String, Object> source = new HashMap<>();
            source.put("id", "ALT-001");
            source.put("title", "Ransomware Encryption Detected");
            source.put("summary", "Encryption activity on endpoint");
            source.put("severity", 10);
            source.put("riskScore", 95.5);
            source.put("confidence", 92);
            source.put("@timestamp", "2026-08-05T08:00:00Z");
            source.put("status", 2);
            source.put("statusLabel", "In Review");
            source.put("category", "malware");
            source.put("primaryEntity", Map.of("id", "host-01", "type", "host", "label", "srv-dc01"));
            source.put("assigneeName", "John Doe");
            source.put("slaStatus", "on_track");
            source.put("threatIntelMatched", true);
            source.put("relatedAlertCount", 3);
            source.put("mitreTechniqueId", "T1486");
            source.put("tenantName", "CWM");
            source.put("tags", List.of("ransomware", "critical"));

            AlertPreview preview = HaSeverityBoardService.parseAlertPreview(source, "doc-fallback-id");

            assertThat(preview.id()).isEqualTo("ALT-001");
            assertThat(preview.title()).isEqualTo("Ransomware Encryption Detected");
            assertThat(preview.summary()).isEqualTo("Encryption activity on endpoint");
            assertThat(preview.severity()).isEqualTo(10);
            assertThat(preview.riskScore()).isEqualTo(95.5);
            assertThat(preview.confidence()).isEqualTo(92);
            assertThat(preview.detectedAt()).isEqualTo(Instant.parse("2026-08-05T08:00:00Z"));
            assertThat(preview.status()).isEqualTo(2);
            assertThat(preview.statusLabel()).isEqualTo("In Review");
            assertThat(preview.category()).isEqualTo("malware");
            assertThat(preview.primaryEntity().id()).isEqualTo("host-01");
            assertThat(preview.primaryEntity().type()).isEqualTo("host");
            assertThat(preview.primaryEntity().label()).isEqualTo("srv-dc01");
            assertThat(preview.assigneeName()).isEqualTo("John Doe");
            assertThat(preview.slaStatus()).isEqualTo("on_track");
            assertThat(preview.threatIntelMatched()).isTrue();
            assertThat(preview.relatedAlertCount()).isEqualTo(3);
            assertThat(preview.mitreTechniqueId()).isEqualTo("T1486");
            assertThat(preview.tenantName()).isEqualTo("CWM");
            assertThat(preview.tags()).containsExactly("ransomware", "critical");
        }

        @Test
        @DisplayName("handles all null/missing fields gracefully with safe defaults")
        void parseAlertPreview_emptySource() {
            Map<String, Object> source = new HashMap<>();

            AlertPreview preview = HaSeverityBoardService.parseAlertPreview(source, "fallback-id");

            assertThat(preview.id()).isEqualTo("fallback-id");
            assertThat(preview.title()).isEmpty();
            assertThat(preview.summary()).isEmpty();
            assertThat(preview.severity()).isZero();
            assertThat(preview.riskScore()).isZero();
            assertThat(preview.confidence()).isZero();
            assertThat(preview.detectedAt()).isEqualTo(Instant.EPOCH);
            assertThat(preview.status()).isZero();
            assertThat(preview.statusLabel()).isEqualTo("Unknown");
            assertThat(preview.category()).isEmpty();
            assertThat(preview.primaryEntity().id()).isEmpty();
            assertThat(preview.primaryEntity().type()).isEmpty();
            assertThat(preview.primaryEntity().label()).isEmpty();
            assertThat(preview.assigneeName()).isNull();
            assertThat(preview.slaStatus()).isEmpty();
            assertThat(preview.threatIntelMatched()).isFalse();
            assertThat(preview.relatedAlertCount()).isZero();
            assertThat(preview.mitreTechniqueId()).isNull();
            assertThat(preview.tenantName()).isEmpty();
            assertThat(preview.tags()).isEmpty();
        }

        @Test
        @DisplayName("uses hitId as fallback when source has no id field")
        void parseAlertPreview_idFallback() {
            Map<String, Object> source = new HashMap<>();
            // No "id" field in source

            AlertPreview preview = HaSeverityBoardService.parseAlertPreview(source, "doc-123");

            assertThat(preview.id()).isEqualTo("doc-123");
        }

        @Test
        @DisplayName("uses source id field over hitId when present")
        void parseAlertPreview_sourceIdOverHitId() {
            Map<String, Object> source = new HashMap<>();
            source.put("id", "source-id-456");

            AlertPreview preview = HaSeverityBoardService.parseAlertPreview(source, "hit-id-789");

            assertThat(preview.id()).isEqualTo("source-id-456");
        }

        @Test
        @DisplayName("prefers @timestamp over detectedAt for detectedAt field")
        void parseAlertPreview_timestampPreference() {
            Map<String, Object> source = new HashMap<>();
            source.put("@timestamp", "2026-08-05T10:00:00Z");
            source.put("detectedAt", "2026-08-01T01:00:00Z");

            AlertPreview preview = HaSeverityBoardService.parseAlertPreview(source, "id");

            assertThat(preview.detectedAt()).isEqualTo(Instant.parse("2026-08-05T10:00:00Z"));
        }

        @Test
        @DisplayName("falls back to detectedAt when @timestamp is absent")
        void parseAlertPreview_detectedAtFallback() {
            Map<String, Object> source = new HashMap<>();
            source.put("detectedAt", "2026-08-01T01:00:00Z");

            AlertPreview preview = HaSeverityBoardService.parseAlertPreview(source, "id");

            assertThat(preview.detectedAt()).isEqualTo(Instant.parse("2026-08-01T01:00:00Z"));
        }

        @Test
        @DisplayName("parses epoch millis timestamp")
        void parseAlertPreview_epochMillis() {
            Map<String, Object> source = new HashMap<>();
            source.put("@timestamp", 1722844800000L); // 2024-08-05T08:00:00Z

            AlertPreview preview = HaSeverityBoardService.parseAlertPreview(source, "id");

            assertThat(preview.detectedAt()).isEqualTo(Instant.ofEpochMilli(1722844800000L));
        }

        @Test
        @DisplayName("numeric fields parsed from string representations")
        void parseAlertPreview_stringNumericFields() {
            Map<String, Object> source = new HashMap<>();
            source.put("severity", "8");
            source.put("riskScore", "85.5");
            source.put("confidence", "90");
            source.put("status", "3");
            source.put("relatedAlertCount", "5");

            AlertPreview preview = HaSeverityBoardService.parseAlertPreview(source, "id");

            assertThat(preview.severity()).isEqualTo(8);
            assertThat(preview.riskScore()).isEqualTo(85.5);
            assertThat(preview.confidence()).isEqualTo(90);
            assertThat(preview.status()).isEqualTo(3);
            assertThat(preview.relatedAlertCount()).isEqualTo(5);
        }

        @Test
        @DisplayName("tags as single string wrapped in list")
        void parseAlertPreview_singleTagString() {
            Map<String, Object> source = new HashMap<>();
            source.put("tags", "solo-tag");

            AlertPreview preview = HaSeverityBoardService.parseAlertPreview(source, "id");

            assertThat(preview.tags()).containsExactly("solo-tag");
        }

        @Test
        @DisplayName("statusLabel derived from status when field is absent")
        void parseAlertPreview_statusLabelDerived() {
            Map<String, Object> source = new HashMap<>();
            source.put("status", 4);

            AlertPreview preview = HaSeverityBoardService.parseAlertPreview(source, "id");

            assertThat(preview.statusLabel()).isEqualTo("Escalated");
        }
    }

    // =========================================================================
    // mapStatusToLabel
    // =========================================================================

    @Nested
    @DisplayName("mapStatusToLabel")
    class MapStatusToLabelTests {

        @ParameterizedTest(name = "status {0} → \"{1}\"")
        @DisplayName("maps numeric status to correct label")
        @CsvSource({
            "1, New",
            "2, In Review",
            "3, In Progress",
            "4, Escalated",
            "5, Resolved",
            "6, Closed",
            "7, Suppressed",
            "0, Unknown",
            "99, Unknown"
        })
        void mapStatusToLabel_values(int status, String expectedLabel) {
            assertThat(HaSeverityBoardService.mapStatusToLabel(status))
                .isEqualTo(expectedLabel);
        }
    }
}
