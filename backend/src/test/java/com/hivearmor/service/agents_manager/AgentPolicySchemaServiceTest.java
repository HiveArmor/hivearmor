package com.hivearmor.service.agents_manager;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Schema v1 serialization / normalization for BE-POL-01.
 * STAGING CANDIDATE — not PRODUCTION READY.
 */
class AgentPolicySchemaServiceTest {

    private AgentPolicySchemaService service;
    private ObjectMapper mapper;

    @BeforeEach
    void setUp() {
        mapper = new ObjectMapper();
        service = new AgentPolicySchemaService(mapper);
    }

    @Test
    void emptyConfigYieldsSchemaV1Defaults() throws Exception {
        String json = service.normalizePolicyConfig("");
        JsonNode root = mapper.readTree(json);
        assertThat(root.get("schema_version").asInt()).isEqualTo(1);
        assertThat(root.get("fim").get("mode").asText()).isEqualTo("merge");
        assertThat(root.get("fim").get("rules").isArray()).isTrue();
        assertThat(root.get("fim").get("rules")).isEmpty();
        assertThat(root.get("response").get("allow_shell").asBoolean()).isFalse();
        assertThat(root.get("collectors").get("fim").asBoolean()).isTrue();
        assertThat(root.get("collectors").get("netflow").asBoolean()).isTrue();
    }

    @Test
    void roundTripsFimExcludeAndAllowShell() throws Exception {
        String input = """
            {
              "schema_version": 1,
              "fim": {
                "mode": "replace",
                "rules": [
                  { "path": "/etc", "recursive": true, "exclude": ["*.tmp", "*.swp"] }
                ]
              },
              "collectors": { "fim": true, "dns": false },
              "response": { "allow_shell": true }
            }
            """;
        String normalized = service.normalizePolicyConfig(input);
        JsonNode root = mapper.readTree(normalized);
        assertThat(root.get("schema_version").asInt()).isEqualTo(1);
        assertThat(root.get("fim").get("mode").asText()).isEqualTo("replace");
        assertThat(root.get("fim").get("rules").get(0).get("path").asText()).isEqualTo("/etc");
        assertThat(root.get("fim").get("rules").get(0).get("exclude").get(0).asText()).isEqualTo("*.tmp");
        assertThat(root.get("response").get("allow_shell").asBoolean()).isTrue();
        assertThat(root.get("collectors").get("dns").asBoolean()).isFalse();
    }

    @Test
    void rejectsUnsupportedSchemaVersion() {
        assertThatThrownBy(() -> service.normalizePolicyConfig("{\"schema_version\":99}"))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("schema_version");
    }

    @Test
    void rejectsInvalidFimMode() {
        assertThatThrownBy(() -> service.normalizePolicyConfig(
            "{\"schema_version\":1,\"fim\":{\"mode\":\"append\",\"rules\":[]}}"))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("fim.mode");
    }

    @Test
    void rejectsRuleWithoutPath() {
        assertThatThrownBy(() -> service.normalizePolicyConfig(
            "{\"schema_version\":1,\"fim\":{\"mode\":\"merge\",\"rules\":[{\"path\":\"\"}]}}"))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("path is required");
    }

    @Test
    void fromHaColumnsMapsFilePathsAndNetworkToggles() throws Exception {
        String json = service.fromHaColumns(
            List.of("/etc", "C:\\\\Windows\\\\System32"),
            false,
            true
        );
        JsonNode root = mapper.readTree(json);
        assertThat(root.get("schema_version").asInt()).isEqualTo(1);
        assertThat(root.get("fim").get("mode").asText()).isEqualTo("merge");
        assertThat(root.get("fim").get("rules")).hasSize(2);
        assertThat(root.get("fim").get("rules").get(0).get("path").asText()).isEqualTo("/etc");
        assertThat(root.get("fim").get("rules").get(0).get("recursive").asBoolean()).isTrue();
        assertThat(root.get("collectors").get("netconn").asBoolean()).isFalse();
        assertThat(root.get("response").get("allow_shell").asBoolean()).isFalse();
    }

    @Test
    void telemetryIntervalsNormalizeAsSchemaV11Additive() throws Exception {
        String input = """
            {
              "schema_version": 1,
              "telemetry": {
                "sca_interval_hours": 12,
                "sbom_interval_hours": 24
              }
            }
            """;
        String normalized = service.normalizePolicyConfig(input);
        JsonNode root = mapper.readTree(normalized);
        assertThat(root.get("schema_version").asInt()).isEqualTo(1);
        assertThat(root.get("telemetry").get("sca_interval_hours").asInt()).isEqualTo(12);
        assertThat(root.get("telemetry").get("sbom_interval_hours").asInt()).isEqualTo(24);
        assertThat(AgentPolicySchemaV1.SCHEMA_FEATURE).isEqualTo("1.3");
    }

    @Test
    void roundTripsOptionalRegistryKeys() throws Exception {
        String input = """
            {
              "schema_version": 1,
              "fim": {
                "mode": "merge",
                "rules": [],
                "registry": {
                  "mode": "replace",
                  "keys": ["SOFTWARE\\\\Microsoft\\\\Windows\\\\CurrentVersion\\\\Run"]
                }
              }
            }
            """;
        String normalized = service.normalizePolicyConfig(input);
        JsonNode root = mapper.readTree(normalized);
        assertThat(root.get("fim").get("registry").get("mode").asText()).isEqualTo("replace");
        assertThat(root.get("fim").get("registry").get("keys").get(0).asText())
            .contains("CurrentVersion");
    }

    @Test
    void fromHaColumnsMapsRegistryPaths() throws Exception {
        String json = service.fromHaColumns(
            List.of("/etc"),
            List.of("SOFTWARE\\\\Microsoft\\\\Windows\\\\CurrentVersion\\\\Run"),
            true,
            true
        );
        JsonNode root = mapper.readTree(json);
        assertThat(root.get("fim").get("registry").get("keys")).hasSize(1);
    }

    @Test
    void telemetryMissingIntervalsDefaultToSixHours() throws Exception {
        String normalized = service.normalizePolicyConfig(
            "{\"schema_version\":1,\"telemetry\":{}}");
        JsonNode root = mapper.readTree(normalized);
        assertThat(root.get("telemetry").get("sca_interval_hours").asInt()).isEqualTo(6);
        assertThat(root.get("telemetry").get("sbom_interval_hours").asInt()).isEqualTo(6);
    }

    @Test
    void emptyConfigOmitsTelemetryForBackwardCompat() throws Exception {
        String json = service.normalizePolicyConfig("{}");
        JsonNode root = mapper.readTree(json);
        assertThat(root.has("telemetry")).isFalse();
    }

    @Test
    void rejectsTelemetryIntervalOutOfRange() {
        assertThatThrownBy(() -> service.normalizePolicyConfig(
            "{\"schema_version\":1,\"telemetry\":{\"sca_interval_hours\":0}}"))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("sca_interval_hours");

        assertThatThrownBy(() -> service.normalizePolicyConfig(
            "{\"schema_version\":1,\"telemetry\":{\"sbom_interval_hours\":200}}"))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("sbom_interval_hours");
    }

    // ------------------------------------------------------------------
    // PT-0 additive template sections — round-trip + FIM-only regression.
    // ------------------------------------------------------------------

    @Test
    void pt0FimOnlyPolicyOmitsAllNewSections() throws Exception {
        // A policy carrying only FIM must emit exactly today's keys — no monitor/event/
        // ueba/userLog/change/script/certificate/osquery/scans — so it round-trips
        // byte-identically for deployed agents (the core PT-0 regression guarantee).
        String input = """
            {
              "schema_version": 1,
              "fim": { "mode": "merge", "rules": [ { "path": "/etc" } ] }
            }
            """;
        String normalized = service.normalizePolicyConfig(input);
        JsonNode root = mapper.readTree(normalized);
        assertThat(root.get("schema_version").asInt()).isEqualTo(1);
        assertThat(root.get("fim").get("rules").get(0).get("path").asText()).isEqualTo("/etc");
        assertThat(root.has("monitor")).isFalse();
        assertThat(root.has("event")).isFalse();
        assertThat(root.has("ueba")).isFalse();
        assertThat(root.has("userLog")).isFalse();
        assertThat(root.has("change")).isFalse();
        assertThat(root.has("script")).isFalse();
        assertThat(root.has("certificate")).isFalse();
        assertThat(root.has("osquery")).isFalse();
        assertThat(root.has("scans")).isFalse();
    }

    @Test
    void pt0LegacyServeUnchangedForFimOnlyPolicy() throws Exception {
        // The serve path (list/get) must not inject new sections into legacy rows.
        String served = service.normalizePolicyConfigForServe(
            "{\"schema_version\":1,\"fim\":{\"mode\":\"replace\",\"rules\":[{\"path\":\"/var\"}]}}");
        JsonNode root = mapper.readTree(served);
        assertThat(root.get("fim").get("mode").asText()).isEqualTo("replace");
        assertThat(root.has("scans")).isFalse();
        assertThat(root.has("event")).isFalse();
    }

    @Test
    void pt0RoundTripsMonitorEventUebaSections() throws Exception {
        String input = """
            {
              "schema_version": 1,
              "monitor": { "items": [ { "metric": "cpu", "intervalSec": 300 } ] },
              "event": {
                "fileLog": { "iis": true, "dhcp": false },
                "eventLogs": [ { "type": "Security", "include": "ALL", "exclude": "NONE" },
                               { "type": "Other", "channel": "Microsoft-Windows-Sysmon/Operational",
                                 "include": ["1","2"], "exclude": "NONE" } ]
              },
              "ueba": { "enabled": true }
            }
            """;
        String normalized = service.normalizePolicyConfig(input);
        JsonNode root = mapper.readTree(normalized);
        assertThat(root.get("monitor").get("items").get(0).get("metric").asText()).isEqualTo("cpu");
        assertThat(root.get("monitor").get("items").get(0).get("intervalSec").asInt()).isEqualTo(300);
        assertThat(root.get("event").get("fileLog").get("iis").asBoolean()).isTrue();
        assertThat(root.get("event").get("eventLogs").get(1).get("channel").asText())
            .isEqualTo("Microsoft-Windows-Sysmon/Operational");
        assertThat(root.get("event").get("eventLogs").get(1).get("include").get(0).asText()).isEqualTo("1");
        assertThat(root.get("ueba").get("enabled").asBoolean()).isTrue();
    }

    @Test
    void pt0RoundTripsScansBlock() throws Exception {
        String input = """
            {
              "schema_version": 1,
              "scans": {
                "cis":  { "enabled": true, "profile": "CIS_L1", "mode": "scheduled",
                          "cronOrInterval": "0 3 * * *", "source": "agent" },
                "vuln": { "enabled": true, "mode": "scheduled",
                          "cronOrInterval": "0 4 * * 0", "source": "agent" }
              }
            }
            """;
        String normalized = service.normalizePolicyConfig(input);
        JsonNode root = mapper.readTree(normalized);
        assertThat(root.get("scans").get("cis").get("profile").asText()).isEqualTo("CIS_L1");
        assertThat(root.get("scans").get("cis").get("mode").asText()).isEqualTo("scheduled");
        assertThat(root.get("scans").get("cis").get("source").asText()).isEqualTo("agent");
        assertThat(root.get("scans").get("vuln").get("cronOrInterval").asText()).isEqualTo("0 4 * * 0");
    }

    @Test
    void pt0RoundTripsUserLogChangeScriptCertificateOsquery() throws Exception {
        String input = """
            {
              "schema_version": 1,
              "userLog": [ { "fullFileName": "/var/log/app.log", "logPrefix": "APP",
                             "multiline": { "start": "^", "end": "$", "maxLines": 50 } } ],
              "change": { "registry": [ { "rootKey": "HKLM\\\\SOFTWARE", "excludeSubkeys": ["Uninstall"] } ],
                          "installedSoftware": true },
              "script": { "wmi": ["Win32_Service"], "powershell": ["Get-LocalUser"] },
              "certificate": [ { "store": "MY", "add": true, "expiring": true } ],
              "osquery": { "queries": ["startup_items"] }
            }
            """;
        String normalized = service.normalizePolicyConfig(input);
        JsonNode root = mapper.readTree(normalized);
        assertThat(root.get("userLog").get(0).get("fullFileName").asText()).isEqualTo("/var/log/app.log");
        assertThat(root.get("userLog").get(0).get("multiline").get("maxLines").asInt()).isEqualTo(50);
        assertThat(root.get("change").get("registry").get(0).get("rootKey").asText()).isEqualTo("HKLM\\SOFTWARE");
        assertThat(root.get("change").get("installedSoftware").asBoolean()).isTrue();
        assertThat(root.get("script").get("wmi").get(0).asText()).isEqualTo("Win32_Service");
        assertThat(root.get("certificate").get(0).get("store").asText()).isEqualTo("MY");
        assertThat(root.get("osquery").get("queries").get(0).asText()).isEqualTo("startup_items");
    }

    @Test
    void pt0PreservesFimAlongsideNewSections() throws Exception {
        // Extending a policy with new sections must not disturb the existing FIM contract.
        String input = """
            {
              "schema_version": 1,
              "fim": { "mode": "replace", "rules": [ { "path": "/etc", "exclude": ["*.tmp"] } ],
                       "registry": { "mode": "merge", "keys": ["SOFTWARE\\\\Run"] } },
              "collectors": { "fim": true, "dns": false },
              "response": { "allow_shell": true },
              "ueba": { "enabled": false }
            }
            """;
        String normalized = service.normalizePolicyConfig(input);
        JsonNode root = mapper.readTree(normalized);
        assertThat(root.get("fim").get("mode").asText()).isEqualTo("replace");
        assertThat(root.get("fim").get("rules").get(0).get("exclude").get(0).asText()).isEqualTo("*.tmp");
        assertThat(root.get("fim").get("registry").get("keys").get(0).asText()).isEqualTo("SOFTWARE\\Run");
        assertThat(root.get("collectors").get("dns").asBoolean()).isFalse();
        assertThat(root.get("response").get("allow_shell").asBoolean()).isTrue();
        assertThat(root.get("ueba").get("enabled").asBoolean()).isFalse();
    }
}
