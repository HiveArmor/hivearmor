package com.hivearmor.service.telemetry;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.multitenancy.TenantContext;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;

class HaVulnServiceTest {

    private final HaVulnService service = new HaVulnService(mock(JdbcTemplate.class), new ObjectMapper());

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
        assertThatThrownBy(() -> service.findAll(null, null, null, null, null, null, 0, 101, null))
            .isInstanceOf(TelemetryQueryException.class)
            .hasFieldOrPropertyWithValue("code", "TELEMETRY_SIZE_INVALID");
    }

    @Test
    void rejectsUnknownSeverity() {
        assertThatThrownBy(() -> service.findAll(null, "URGENT", null, null, null, null, 0, 25, null))
            .isInstanceOf(TelemetryQueryException.class)
            .hasFieldOrPropertyWithValue("code", "VULN_SEVERITY_INVALID");
    }

    @Test
    void rejectsInvalidTimeRange() {
        assertThatThrownBy(() -> service.findAll(null, null, null, null, "yesterday", null, 0, 25, null))
            .isInstanceOf(TelemetryQueryException.class)
            .hasFieldOrPropertyWithValue("code", "VULN_TIME_RANGE_INVALID");
    }

    @Test
    void rejectsNegativePage() {
        assertThatThrownBy(() -> service.findAll(null, null, null, null, null, null, -1, 25, null))
            .isInstanceOf(TelemetryQueryException.class)
            .hasFieldOrPropertyWithValue("code", "TELEMETRY_PAGE_INVALID");
    }
}
