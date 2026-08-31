package com.hivearmor.service.compliance;

import com.hivearmor.multitenancy.MsspIndexResolver;
import com.hivearmor.repository.compliance.UtmComplianceQueryConfigRepository;
import com.hivearmor.service.compliance.config.UtmComplianceControlEvaluationHistoryService;
import com.hivearmor.service.dto.compliance.UtmComplianceControlEvaluationHistoryResponseDto;
import com.hivearmor.service.elasticsearch.ElasticsearchService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.opensearch.client.opensearch.core.SearchRequest;
import org.opensearch.client.opensearch.core.SearchResponse;
import org.opensearch.client.opensearch.core.search.HitsMetadata;
import org.opensearch.client.opensearch.core.search.TotalHits;
import org.opensearch.client.opensearch.core.search.TotalHitsRelation;
import org.springframework.data.domain.PageRequest;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class ComplianceReadPathStabilizationTest {

    private ElasticsearchService elasticsearchService;
    private ComplianceEvidenceService evidenceService;
    private UtmComplianceControlEvaluationHistoryService historyService;

    @BeforeEach
    void setUp() {
        elasticsearchService = mock(ElasticsearchService.class);
        evidenceService = new ComplianceEvidenceService(elasticsearchService, new MsspIndexResolver());
        historyService = new UtmComplianceControlEvaluationHistoryService(
                elasticsearchService,
                mock(UtmComplianceQueryConfigRepository.class)
        );
    }

    @Test
    void getEvaluationsWithRange_noDataReturnsEmptyEvaluations() {
        when(elasticsearchService.getControlEvaluations(1L)).thenReturn(List.of());

        UtmComplianceControlEvaluationHistoryResponseDto response =
                historyService.getEvaluationsWithRange(1L);

        assertThat(response.getEvaluations()).isEmpty();
        assertThat(response.getStartDate()).isNull();
        assertThat(response.getEndDate()).isNull();
    }

    @Test
    void getEvidenceForControl_missingIndexReturnsEmptyPage() throws Exception {
        when(elasticsearchService.search(any(SearchRequest.class), eq(Map.class)))
                .thenThrow(new RuntimeException("index_not_found_exception"));

        var page = evidenceService.getEvidenceForControl(1L, null, 30, PageRequest.of(0, 20));

        assertThat(page.getContent()).isEmpty();
        assertThat(page.getTotalElements()).isZero();
    }

    @Test
    void getEvidenceForControl_queriesSnakeCaseIndexFields() throws Exception {
        ArgumentCaptor<SearchRequest> requestCaptor = ArgumentCaptor.forClass(SearchRequest.class);
        SearchResponse<Map> emptyResponse = SearchResponse.searchResponseOf(r -> r
                .hits(HitsMetadata.of(h -> h
                        .total(TotalHits.of(t -> t.value(0L).relation(TotalHitsRelation.Eq)))
                        .hits(List.of())))
                .took(1L)
                .timedOut(false)
                .shards(s -> s.total(1).successful(1).failed(0)));
        when(elasticsearchService.search(requestCaptor.capture(), eq(Map.class))).thenReturn(emptyResponse);

        evidenceService.getEvidenceForControl(1L, null, 30, PageRequest.of(0, 20));

        String requestJson = requestCaptor.getValue().toString();
        assertThat(requestJson).contains("control_id");
        assertThat(requestJson).doesNotContain("controlId");
        assertThat(requestJson).contains("timestamp");
        assertThat(requestJson).doesNotContain("@timestamp");
    }
}
