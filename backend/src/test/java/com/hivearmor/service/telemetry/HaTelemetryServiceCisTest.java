package com.hivearmor.service.telemetry;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.config.HaAirGapConfig;
import com.hivearmor.multitenancy.MsspIndexResolver;
import com.hivearmor.service.elasticsearch.OpensearchClientBuilder;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.transaction.PlatformTransactionManager;

import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Unit tests for {@link HaTelemetryService#processCis} — the CIS→OpenSearch ingest
 * (PT-5, Option A). These run in CI (the full mvn build's protoc step is unrelated).
 */
class HaTelemetryServiceCisTest {

    private final ObjectMapper om = new ObjectMapper();

    private HaTelemetryService newService(OpensearchClientBuilder os, MsspIndexResolver resolver) {
        return new HaTelemetryService(
            mock(JdbcTemplate.class),
            os,
            mock(HaAirGapConfig.AirGapGuard.class),
            mock(OsvEnrichmentService.class),
            mock(PlatformTransactionManager.class),
            resolver);
    }

    private JsonNode payload() throws Exception {
        return om.readTree("{"
            + "\"agentId\":\"7\",\"hostname\":\"host-7\",\"profile\":\"CIS_Ubuntu_22.04_L1\","
            + "\"benchmark\":\"ssg-ubuntu\",\"mode\":\"scheduled\",\"scannedAt\":\"2026-10-20T10:00:00Z\","
            + "\"durationMs\":1234,"
            + "\"results\":["
            + "{\"controlId\":\"c1\",\"title\":\"t1\",\"severity\":\"high\",\"status\":\"FAIL\"},"
            + "{\"controlId\":\"c2\",\"title\":\"t2\",\"severity\":\"low\",\"status\":\"PASS\"}"
            + "]}");
    }

    @Test
    void indexesControlsPlusSummaryToTheResolvedCisIndex() throws Exception {
        OpensearchClientBuilder os = mock(OpensearchClientBuilder.class);
        MsspIndexResolver resolver = mock(MsspIndexResolver.class);
        when(resolver.resolveCurrentDayIndex("cis")).thenReturn("v3-hive-cis-acme-2026.10.20");

        AtomicInteger indexCalls = new AtomicInteger();
        when(os.execute(any())).thenAnswer(inv -> {
            indexCalls.incrementAndGet();
            return null; // the action's return value is unused by processCis
        });

        newService(os, resolver).processCis(payload(), 1L, "acme");

        // 2 control docs + 1 summary doc = 3 index operations, all to the SDK-built index.
        assertThat(indexCalls.get()).isEqualTo(3);
        verify(resolver).resolveCurrentDayIndex("cis");
    }

    @Test
    void failsClosedWhenMsspScopeUnresolved() throws Exception {
        OpensearchClientBuilder os = mock(OpensearchClientBuilder.class);
        MsspIndexResolver resolver = mock(MsspIndexResolver.class);
        // The resolver throws for an MSSP request whose prefix did not resolve.
        when(resolver.resolveCurrentDayIndex("cis"))
            .thenThrow(new AccessDeniedException("tenant scope is required"));

        newService(os, resolver).processCis(payload(), 1L, null);

        // Fail-closed: nothing is written, no widening to all tenants.
        verify(os, never()).execute(any());
    }

    @Test
    void ignoresPayloadWithoutAgentId() throws Exception {
        OpensearchClientBuilder os = mock(OpensearchClientBuilder.class);
        MsspIndexResolver resolver = mock(MsspIndexResolver.class);
        JsonNode noAgent = om.readTree("{\"profile\":\"p\",\"results\":[]}");

        newService(os, resolver).processCis(noAgent, 1L, "acme");

        verify(os, never()).execute(any());
        verify(resolver, never()).resolveCurrentDayIndex(any());
    }
}
