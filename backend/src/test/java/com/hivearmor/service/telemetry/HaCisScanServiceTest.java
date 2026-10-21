package com.hivearmor.service.telemetry;

import com.hivearmor.multitenancy.MsspIndexResolver;
import com.hivearmor.service.dto.cis.CisScanSummaryDTO;
import com.hivearmor.service.elasticsearch.ElasticsearchService;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class HaCisScanServiceTest {

    private final ElasticsearchService es = mock(ElasticsearchService.class);
    private final MsspIndexResolver resolver = mock(MsspIndexResolver.class);
    private final HaCisScanService service = new HaCisScanService(es, resolver);

    @Test
    void requiresAgentId() {
        assertThatThrownBy(() -> service.summaryByAgent(""))
            .isInstanceOf(TelemetryQueryException.class)
            .hasFieldOrPropertyWithValue("code", "CIS_AGENT_INVALID");
    }

    @Test
    void rejectsOversizedAgentId() {
        String tooLong = "a".repeat(300);
        assertThatThrownBy(() -> service.summaryByAgent(tooLong))
            .isInstanceOf(TelemetryQueryException.class)
            .hasFieldOrPropertyWithValue("code", "CIS_AGENT_INVALID");
    }

    @Test
    void rejectsUnknownStatusFilter() {
        when(resolver.resolveIndexPattern("cis")).thenReturn("v3-hive-cis-acme-*");
        when(es.indexExist(anyString())).thenReturn(true);
        assertThatThrownBy(() -> service.findResultsByAgent("7", "WARN"))
            .isInstanceOf(TelemetryQueryException.class)
            .hasFieldOrPropertyWithValue("code", "CIS_STATUS_INVALID");
    }

    @Test
    void returnsNotScannedWhenIndexAbsent() {
        when(resolver.resolveIndexPattern("cis")).thenReturn("v3-hive-cis-acme-*");
        when(es.indexExist("v3-hive-cis-acme-*")).thenReturn(false);

        CisScanSummaryDTO summary = service.summaryByAgent("7");

        // Honesty: an unscanned host is NEVER a fabricated 100%.
        assertThat(summary.isScanned()).isFalse();
        assertThat(summary.getTotal()).isZero();
        assertThat(summary.getScorePct()).isZero();
        assertThat(summary.getAgentId()).isEqualTo("7");
    }

    @Test
    void returnsEmptyResultsWhenIndexAbsent() {
        when(resolver.resolveIndexPattern("cis")).thenReturn("v3-hive-cis-acme-*");
        when(es.indexExist("v3-hive-cis-acme-*")).thenReturn(false);

        assertThat(service.findResultsByAgent("7", null)).isEmpty();
    }

    @Test
    void usesTheSdkIndexBuilderForTheCisType() {
        when(resolver.resolveIndexPattern("cis")).thenReturn("v3-hive-cis-acme-*");
        when(es.indexExist("v3-hive-cis-acme-*")).thenReturn(false);

        service.summaryByAgent("7");

        // The index name MUST come from the SDK builder for the "cis" type — never
        // a hand-built string (SPEC-PT-5 constraint).
        org.mockito.Mockito.verify(resolver).resolveIndexPattern("cis");
    }
}
