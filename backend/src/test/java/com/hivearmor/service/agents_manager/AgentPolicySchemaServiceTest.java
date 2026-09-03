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
}
