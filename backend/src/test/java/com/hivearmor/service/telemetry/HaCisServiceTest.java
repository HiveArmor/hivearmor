package com.hivearmor.service.telemetry;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.multitenancy.TenantContext;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;

class HaCisServiceTest {

    private final HaCisService service = new HaCisService(mock(JdbcTemplate.class), new ObjectMapper());

    @BeforeEach
    void setTenant() {
        TenantContext.set(1L, "acme");
    }

    @AfterEach
    void clearTenant() {
        TenantContext.clear();
    }

    @Test
    void rejectsOversizedPages() {
        assertThatThrownBy(() -> service.findResults(null, null, null, null, 0, 101, null))
            .isInstanceOf(TelemetryQueryException.class)
            .hasFieldOrPropertyWithValue("code", "TELEMETRY_SIZE_INVALID");
    }

    @Test
    void rejectsUnknownStatus() {
        assertThatThrownBy(() -> service.findResults(null, null, "WARN", null, 0, 50, null))
            .isInstanceOf(TelemetryQueryException.class)
            .hasFieldOrPropertyWithValue("code", "CIS_STATUS_INVALID");
    }

    @Test
    void rejectsUnknownLevel() {
        assertThatThrownBy(() -> service.findResults(null, null, "FAIL", "L3", 0, 50, null))
            .isInstanceOf(TelemetryQueryException.class)
            .hasFieldOrPropertyWithValue("code", "CIS_LEVEL_INVALID");
    }
}
