package com.hivearmor.service.agents_manager;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.networknt.schema.JsonSchema;
import com.networknt.schema.JsonSchemaFactory;
import com.networknt.schema.SpecVersion;
import com.networknt.schema.ValidationMessage;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

import java.io.InputStream;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * PT-0 acceptance: the checked-in JSON Schemas (Draft 2020-12) validate the checked-in
 * example templates + association table. Design-only — no runtime code exercised.
 *
 * <p>Resources live under {@code src/main/resources/policy-templates/}.
 * STAGING CANDIDATE — not PRODUCTION READY.
 */
class PolicyTemplateSchemaFixtureTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static JsonSchema templateSchema;
    private static JsonSchema associationSchema;

    @BeforeAll
    static void loadSchemas() throws Exception {
        JsonSchemaFactory factory = JsonSchemaFactory.getInstance(SpecVersion.VersionFlag.V202012);
        templateSchema = factory.getSchema(
            resource("/policy-templates/schema/policy-template.schema.json"));
        associationSchema = factory.getSchema(
            resource("/policy-templates/schema/host-template-association.schema.json"));
    }

    private static InputStream resource(String path) {
        InputStream in = PolicyTemplateSchemaFixtureTest.class.getResourceAsStream(path);
        assertThat(in).as("resource %s must exist on classpath", path).isNotNull();
        return in;
    }

    private JsonNode fixture(String name) throws Exception {
        return MAPPER.readTree(resource("/policy-templates/fixtures/" + name));
    }

    private void assertValid(JsonSchema schema, String fixtureName) throws Exception {
        Set<ValidationMessage> errors = schema.validate(fixture(fixtureName));
        assertThat(errors)
            .as("fixture %s should validate; errors=%s", fixtureName, errors)
            .isEmpty();
    }

    @Test
    void basicTemplateValidates() throws Exception {
        assertValid(templateSchema, "template-basic.json");
    }

    @Test
    void advancedTemplateValidates() throws Exception {
        assertValid(templateSchema, "template-advanced.json");
    }

    @Test
    void uebaTemplateValidates() throws Exception {
        assertValid(templateSchema, "template-ueba.json");
    }

    @Test
    void scanEnabledTemplateValidates() throws Exception {
        assertValid(templateSchema, "template-scan-enabled.json");
    }

    @Test
    void wireFimPolicyBodyValidatesWhenNamedAsTemplate() throws Exception {
        // The agent WIRE policyConfig (fim object + collectors + response + telemetry) has no
        // 'name' — name is template-library metadata, not part of the agent wire shape. When a
        // library row wraps that same body under a name, it must satisfy the template schema:
        // one section contract for both shapes. Round-trip of the raw wire body itself is
        // covered by AgentPolicySchemaServiceTest.
        com.fasterxml.jackson.databind.node.ObjectNode named =
            (com.fasterxml.jackson.databind.node.ObjectNode) fixture("wire-fim-policy-v1.json");
        named.put("name", "wire-fim-as-template");
        Set<ValidationMessage> errors = templateSchema.validate(named);
        assertThat(errors)
            .as("named wire-fim body should validate as a template; errors=%s", errors)
            .isEmpty();
    }

    @Test
    void associationTableValidates() throws Exception {
        assertValid(associationSchema, "association-example.json");
    }

    @Test
    void scheduledScanRequiresCronOrInterval() throws Exception {
        // Guard the conditional: enabled+scheduled with NO cronOrInterval must fail.
        String bad = """
            { "schema_version": 1, "name": "bad-scan",
              "scans": { "cis": { "enabled": true, "mode": "scheduled", "source": "agent" } } }
            """;
        Set<ValidationMessage> errors = templateSchema.validate(MAPPER.readTree(bad));
        assertThat(errors).as("scheduled scan without cronOrInterval must be rejected").isNotEmpty();
    }

    @Test
    void associationRowRejectsTwoMatchPredicates() throws Exception {
        // match is oneOf — a row with both group and host must fail.
        String bad = """
            { "rows": [ { "rank": 1, "name": "x", "match": { "group": "g", "host": "h" },
                          "templates": ["t"] } ] }
            """;
        Set<ValidationMessage> errors = associationSchema.validate(MAPPER.readTree(bad));
        assertThat(errors).as("two match predicates must be rejected").isNotEmpty();
    }

    @Test
    void templateRejectsMissingName() throws Exception {
        Set<ValidationMessage> errors = templateSchema.validate(
            MAPPER.readTree("{ \"schema_version\": 1 }"));
        assertThat(errors).as("template without name must be rejected").isNotEmpty();
    }
}
