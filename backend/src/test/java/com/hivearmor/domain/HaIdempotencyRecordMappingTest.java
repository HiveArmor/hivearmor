package com.hivearmor.domain;

import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Field;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Guards the jsonb mapping for {@link HaIdempotencyRecord#responseJson}.
 *
 * <p>F07 smoke: missing {@code @JdbcTypeCode(SqlTypes.JSON)} caused
 * {@code POST /api/ha-alerts/bulk/status} to return 500 after a successful
 * OpenSearch update (PostgreSQL rejected varchar → jsonb insert).
 */
class HaIdempotencyRecordMappingTest {

    @Test
    @DisplayName("response_json field is mapped as JSON for PostgreSQL jsonb")
    void responseJson_hasJdbcTypeCodeJson() throws Exception {
        Field field = HaIdempotencyRecord.class.getDeclaredField("responseJson");
        JdbcTypeCode annotation = field.getAnnotation(JdbcTypeCode.class);

        assertThat(annotation)
            .as("HaIdempotencyRecord.responseJson must declare @JdbcTypeCode(SqlTypes.JSON)")
            .isNotNull();
        assertThat(annotation.value()).isEqualTo(SqlTypes.JSON);
    }
}
