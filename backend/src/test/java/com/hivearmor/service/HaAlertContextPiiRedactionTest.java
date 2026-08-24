package com.hivearmor.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.service.llm.HaPiiRedactor;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * Extends the alert whitelist path with value-level PII redaction.
 */
class HaAlertContextPiiRedactionTest {

    @Test
    void whitelistedDescriptionValuesAreRedacted() {
        AlertQueryPort port = mock(AlertQueryPort.class);
        when(port.findById("a1")).thenReturn(Map.of(
            "id", "a1",
            "name", "bruteforce",
            "description", "User alice@corp.example from 203.0.113.10",
            "password", "should-be-dropped"
        ));

        HaAlertContextService sut = new HaAlertContextService(
            port, new ObjectMapper().findAndRegisterModules(), HaPiiRedactor.enabled());

        String json = sut.loadAlertAsJson("a1");
        assertThat(json).isNotNull();
        assertThat(json).contains("[EMAIL_1]");
        assertThat(json).contains("[IP_1]");
        assertThat(json).doesNotContain("alice@");
        assertThat(json).doesNotContain("203.0.113.10");
        assertThat(json).doesNotContain("password");
        assertThat(json).contains("\"name\":\"bruteforce\"");
    }
}
