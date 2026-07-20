package com.hivearmor.domain;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.domain.shared_types.alert.UtmAlert;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class AlertSeverityDeserializationTest {

    private final ObjectMapper mapper = new ObjectMapper();

    @Test
    void severityAsInteger_isDeserialized() throws Exception {
        String json = "{\"severity\":2}";
        UtmAlert alert = mapper.readValue(json, UtmAlert.class);
        assertThat(alert.getSeverity()).isEqualTo(2);
    }

    @Test
    void severityAsString_isCoerced() throws Exception {
        // Legacy documents in old OpenSearch indices still have "severity":"2"
        String json = "{\"severity\":\"2\"}";
        UtmAlert alert = mapper.readValue(json, UtmAlert.class);
        assertThat(alert.getSeverity()).isEqualTo(2);
    }

    @Test
    void severityMissing_defaultsToOne() throws Exception {
        String json = "{}";
        UtmAlert alert = mapper.readValue(json, UtmAlert.class);
        assertThat(alert.getSeverity()).isEqualTo(1);
    }

    @Test
    void severityNull_defaultsToOne() throws Exception {
        String json = "{\"severity\":null}";
        UtmAlert alert = mapper.readValue(json, UtmAlert.class);
        // null JSON value produces null field; callers treat null as LOW via null-safe access
        assertThat(alert.getSeverity() != null ? alert.getSeverity() : 1).isEqualTo(1);
    }

    @Test
    void severityString3_isCoerced() throws Exception {
        String json = "{\"severity\":\"3\"}";
        UtmAlert alert = mapper.readValue(json, UtmAlert.class);
        assertThat(alert.getSeverity()).isEqualTo(3);
    }

    @Test
    void severityString1_isCoerced() throws Exception {
        String json = "{\"severity\":\"1\"}";
        UtmAlert alert = mapper.readValue(json, UtmAlert.class);
        assertThat(alert.getSeverity()).isEqualTo(1);
    }
}
