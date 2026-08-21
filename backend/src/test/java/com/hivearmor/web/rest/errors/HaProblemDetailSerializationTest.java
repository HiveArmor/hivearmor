package com.hivearmor.web.rest.errors;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.http.ProblemDetail;
import org.springframework.http.converter.json.ProblemDetailJacksonMixin;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class HaProblemDetailSerializationTest {

    private final ObjectMapper objectMapper = new ObjectMapper()
        .addMixIn(ProblemDetail.class, ProblemDetailJacksonMixin.class);

    @Test
    void extensionMembersAreSerializedExactlyOnceAtTheTopLevel() throws Exception {
        HaProblemDetail problem = HaProblemDetail.validationFailed(
            "correlation-123",
            List.of(new HaFieldError("platform", "must not be blank", null)),
            "/api/ha-agent-enrollments");

        String json = objectMapper.writeValueAsString(problem);

        assertThat(json)
            .containsOnlyOnce("\"correlationId\"")
            .containsOnlyOnce("\"fieldErrors\"")
            .doesNotContain("\"properties\"");
        assertThat(objectMapper.readTree(json).path("correlationId").asText())
            .isEqualTo("correlation-123");
        assertThat(objectMapper.readTree(json).path("fieldErrors").get(0).path("field").asText())
            .isEqualTo("platform");
    }
}
