package com.hivearmor.service.impl;

import com.hivearmor.config.Constants;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.opensearch.client.json.JsonpMapper;
import org.opensearch.client.json.jackson.JacksonJsonpMapper;
import org.opensearch.client.opensearch._types.query_dsl.Query;

import jakarta.json.stream.JsonGenerator;
import java.io.StringWriter;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Focused tests for legacy alert status update query construction.
 *
 * <p>F07 smoke: {@code POST /api/ha-alerts/status} returned 200 but did not persist
 * because updates filtered only on {@code id.keyword}/{@code parentId.keyword}, while
 * v3 documents use {@code alertId} and document {@code _id}.
 */
class UtmAlertServiceImplUpdateStatusTest {

    private final JsonpMapper mapper = new JacksonJsonpMapper();

    @Test
    @DisplayName("buildAlertIdsQuery matches _id, alertId.keyword, id.keyword, and parentId.keyword")
    void buildAlertIdsQuery_includesAllIdentifierFields() {
        Query query = UtmAlertServiceImpl.buildAlertIdsQuery(
            List.of("e2e-alert-exfiltration-001"));

        String json = toJson(query);

        assertThat(json).contains("\"ids\"");
        assertThat(json).contains("e2e-alert-exfiltration-001");
        assertThat(json).contains(Constants.alertDocumentIdKeyword);
        assertThat(json).contains(Constants.alertIdKeyword);
        assertThat(json).contains(Constants.alertParentIdKeyword);
        assertThat(json).containsIgnoringCase("minimum_should_match");
    }

    @Test
    @DisplayName("buildAlertIdsQuery accepts multiple alert ids")
    void buildAlertIdsQuery_multipleIds() {
        Query query = UtmAlertServiceImpl.buildAlertIdsQuery(
            List.of("alert-a", "alert-b"));

        String json = toJson(query);
        assertThat(json).contains("alert-a");
        assertThat(json).contains("alert-b");
    }

    private String toJson(Query query) {
        StringWriter writer = new StringWriter();
        try (JsonGenerator generator = mapper.jsonProvider().createGenerator(writer)) {
            mapper.serialize(query, generator);
        }
        return writer.toString();
    }
}
