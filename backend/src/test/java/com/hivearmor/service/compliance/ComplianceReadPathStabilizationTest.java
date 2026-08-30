package com.hivearmor.service.compliance;

import com.hivearmor.multitenancy.MsspIndexResolver;
import com.hivearmor.repository.compliance.UtmComplianceQueryConfigRepository;
import com.hivearmor.service.compliance.config.UtmComplianceControlEvaluationHistoryService;
import com.hivearmor.service.dto.compliance.UtmComplianceControlEvaluationHistoryResponseDto;
import com.hivearmor.service.elasticsearch.ElasticsearchService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.opensearch.client.opensearch.core.SearchRequest;
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
}
