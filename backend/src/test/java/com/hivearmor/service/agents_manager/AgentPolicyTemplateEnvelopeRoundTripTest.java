package com.hivearmor.service.agents_manager;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * SPEC-PT-1 acceptance — every PT-0 example template round-trips through the library
 * envelope split: library-metadata keys (name/description/scope/orgId/version/platform)
 * are extracted into columns, and the remaining schema-v1 sections validate + normalize
 * into a wire policyConfig. Invalid policyConfig is rejected with a clear error.
 *
 * <p>Reads the real fixtures shipped by PT-0 from the classpath, so a drift between the
 * frozen schema and this service is caught here rather than at runtime.
 */
class AgentPolicyTemplateEnvelopeRoundTripTest {

    private final ObjectMapper mapper = new ObjectMapper();
    private final AgentPolicySchemaService schema = new AgentPolicySchemaService(mapper);

    private String fixture(String name) throws Exception {
        try (var in = getClass().getResourceAsStream("/policy-templates/fixtures/" + name)) {
            assertThat(in).as("fixture " + name + " on classpath").isNotNull();
            return new String(in.readAllBytes(), StandardCharsets.UTF_8);
        }
    }

    private void assertEnvelopeRoundTrips(String fixtureName,
                                          String expectedName,
                                          String expectedScope,
                                          String expectedPlatform) throws Exception {
        String envelope = fixture(fixtureName);

        // 1. metadata extracted into columns
        AgentPolicySchemaService.TemplateEnvelopeMeta meta = schema.extractTemplateMeta(envelope);
        assertThat(meta.name).as("name").isEqualTo(expectedName);
        assertThat(meta.scope).as("scope").isEqualTo(expectedScope);
        assertThat(meta.platform).as("platform").isEqualTo(expectedPlatform);

        // 2. sections validate + normalize into a wire policyConfig, with NO library-metadata keys
        String policyConfig = schema.policyConfigFromTemplateEnvelope(envelope);
        JsonNode wire = mapper.readTree(policyConfig);
        assertThat(wire.has("name")).as("wire drops name").isFalse();
        assertThat(wire.has("scope")).as("wire drops scope").isFalse();
        assertThat(wire.has("version")).as("wire drops version").isFalse();
        assertThat(wire.get("schema_version").asInt()).isEqualTo(1);

        // 3. re-normalizing the produced wire config is stable (idempotent, still valid)
        assertThat(schema.normalizePolicyConfig(policyConfig)).isNotBlank();
    }

    @Test
    void basicTemplateRoundTrips() throws Exception {
        assertEnvelopeRoundTrips("template-basic.json", "sec-log-basic", "GLOBAL", "windows");
    }

    @Test
    void advancedTemplateRoundTrips() throws Exception {
        assertEnvelopeRoundTrips("template-advanced.json", "sec-log-full", "ORG", "windows");
        // advanced carries orgId
        var meta = schema.extractTemplateMeta(fixture("template-advanced.json"));
        assertThat(meta.orgId).isEqualTo("acme");
        assertThat(meta.version).isEqualTo(3);
    }

    @Test
    void uebaTemplateRoundTrips() throws Exception {
        assertEnvelopeRoundTrips("template-ueba.json", "ueba-on", "ORG", "windows");
    }

    @Test
    void scanEnabledTemplateRoundTrips() throws Exception {
        assertEnvelopeRoundTrips("template-scan-enabled.json", "compliance-scan", "GLOBAL", "linux");
        // scans block survives into the wire config
        String pc = schema.policyConfigFromTemplateEnvelope(fixture("template-scan-enabled.json"));
        assertThat(mapper.readTree(pc).path("scans").path("cis").path("enabled").asBoolean()).isTrue();
    }

    @Test
    void bareWirePolicyStillNormalizes() throws Exception {
        // A raw wire FIM policy (no envelope keys) passes straight through.
        String pc = schema.policyConfigFromTemplateEnvelope(fixture("wire-fim-policy-v1.json"));
        JsonNode wire = mapper.readTree(pc);
        assertThat(wire.get("schema_version").asInt()).isEqualTo(1);
        assertThat(wire.path("fim").path("mode").asText()).isEqualTo("replace");
    }

    @Test
    void invalidPolicyConfigRejectedClearly() {
        String badJson = "{ this is not json ";
        assertThatThrownBy(() -> schema.policyConfigFromTemplateEnvelope(badJson))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("valid JSON");
    }

    @Test
    void invalidFimModeRejectedClearly() {
        String bad = "{ \"schema_version\": 1, \"name\": \"x\", "
            + "\"fim\": { \"mode\": \"bogus\", \"rules\": [] } }";
        assertThatThrownBy(() -> schema.policyConfigFromTemplateEnvelope(bad))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("fim.mode");
    }
}
