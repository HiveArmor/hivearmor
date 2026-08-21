package com.hivearmor.service.hunt;

import com.hivearmor.web.rest.hunt.dto.HuntSearchRequestDTO;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class HaHuntServiceFingerprintTest {

    @Test
    void histogramProjectionDoesNotInvalidateContinuationCursor() {
        HaHuntService service = new HaHuntService(null, null, null, null, null, null);
        HuntSearchRequestDTO firstPage = request(true);
        HuntSearchRequestDTO continuation = request(false);

        assertThat(service.fingerprint(firstPage)).isEqualTo(service.fingerprint(continuation));
    }

    @Test
    void resultProjectionStillInvalidatesContinuationCursor() {
        HaHuntService service = new HaHuntService(null, null, null, null, null, null);
        HuntSearchRequestDTO firstPage = request(true);
        HuntSearchRequestDTO changedProjection = request(false);
        changedProjection.setFields(List.of("@timestamp", "host.name"));

        assertThat(service.fingerprint(firstPage)).isNotEqualTo(service.fingerprint(changedProjection));
    }

    private HuntSearchRequestDTO request(boolean includeHistogram) {
        HuntSearchRequestDTO request = new HuntSearchRequestDTO();
        request.setQuery("*:*");
        request.setLanguage("kql");
        request.setTenantScope("authorized");
        request.setLimit(100);
        request.setFields(List.of("@timestamp"));
        request.setIncludeHistogram(includeHistogram);
        HuntSearchRequestDTO.TimeRangeDTO timeRange = new HuntSearchRequestDTO.TimeRangeDTO();
        timeRange.setFrom("2026-08-01T00:00:00Z");
        timeRange.setTo("2026-08-02T00:00:00Z");
        request.setTimeRange(timeRange);
        return request;
    }
}
