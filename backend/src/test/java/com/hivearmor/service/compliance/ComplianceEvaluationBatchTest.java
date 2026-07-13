package com.hivearmor.service.compliance;

import com.hivearmor.domain.compliance.UtmComplianceControlConfig;
import com.hivearmor.service.compliance.config.UtmComplianceControlConfigService;
import com.hivearmor.service.compliance.config.UtmComplianceControlEvaluationLatestService;
import com.hivearmor.service.dto.compliance.UtmComplianceControlConfigDto;
import com.hivearmor.service.dto.compliance.UtmComplianceControlEvaluationHistoryDto;
import com.hivearmor.service.dto.compliance.UtmComplianceControlLatestEvaluationDto;
import com.hivearmor.service.elasticsearch.ElasticsearchService;
import com.hivearmor.service.mapper.compliance.UtmComplianceControlConfigMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class ComplianceEvaluationBatchTest {

    private ElasticsearchService elasticsearchService;
    private UtmComplianceControlConfigService configService;
    private UtmComplianceControlConfigMapper controlMapper;
    private UtmComplianceControlEvaluationLatestService service;

    @BeforeEach
    void setUp() {
        elasticsearchService = mock(ElasticsearchService.class);
        configService = mock(UtmComplianceControlConfigService.class);
        controlMapper = mock(UtmComplianceControlConfigMapper.class);

        service = new UtmComplianceControlEvaluationLatestService(
                configService, elasticsearchService, controlMapper);

        // Default: batch method returns empty map (no evaluations)
        when(elasticsearchService.getBatchLatestEvaluations(anyList()))
                .thenReturn(Collections.emptyMap());

        // Default: mapper returns a stub DTO for any entity
        when(controlMapper.toDto(any(UtmComplianceControlConfig.class)))
                .thenAnswer(inv -> {
                    UtmComplianceControlConfig c = inv.getArgument(0);
                    UtmComplianceControlConfigDto dto = new UtmComplianceControlConfigDto();
                    dto.setId(c.getId());
                    return dto;
                });
    }

    @Test
    void getControlsWithLastEvaluation_fires_singleBatchQuery_not_N_queries() {
        List<UtmComplianceControlConfig> controls = createControls(20);
        Page<UtmComplianceControlConfig> controlPage =
                new PageImpl<>(controls, PageRequest.of(0, 20), 20);
        when(configService.findBySection(any(), any(), any())).thenReturn(controlPage);

        service.getControlsWithLastEvaluation(1L, null, PageRequest.of(0, 20));

        // getBatchLatestEvaluations must be called exactly once, not once per control
        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<Long>> idsCaptor = ArgumentCaptor.forClass(List.class);
        verify(elasticsearchService, times(1)).getBatchLatestEvaluations(idsCaptor.capture());

        // The captured list must contain all 20 control IDs
        List<Long> capturedIds = idsCaptor.getValue();
        assertThat(capturedIds).hasSize(20);

        // Single-evaluation getLatestControlEvaluation must NEVER be called
        verify(elasticsearchService, never()).getLatestControlEvaluation(any());
    }

    @Test
    void emptyControlList_returnsEmptyWithoutQuery() {
        Page<UtmComplianceControlConfig> emptyPage =
                new PageImpl<>(Collections.emptyList(), PageRequest.of(0, 20), 0);
        when(configService.findBySection(any(), any(), any())).thenReturn(emptyPage);

        Page<UtmComplianceControlLatestEvaluationDto> result =
                service.getControlsWithLastEvaluation(1L, null, PageRequest.of(0, 20));

        assertThat(result.getContent()).isEmpty();
        verify(elasticsearchService, never()).getBatchLatestEvaluations(anyList());
        verify(elasticsearchService, never()).getLatestControlEvaluation(any());
    }

    @Test
    void evaluationsArePopulatedFromBatchResult() {
        List<UtmComplianceControlConfig> controls = createControls(3);
        Page<UtmComplianceControlConfig> controlPage =
                new PageImpl<>(controls, PageRequest.of(0, 20), 3);
        when(configService.findBySection(any(), any(), any())).thenReturn(controlPage);

        UtmComplianceControlEvaluationHistoryDto eval = new UtmComplianceControlEvaluationHistoryDto();
        eval.setStatus("pass");
        when(elasticsearchService.getBatchLatestEvaluations(anyList()))
                .thenReturn(Map.of(1L, eval));

        Page<UtmComplianceControlLatestEvaluationDto> result =
                service.getControlsWithLastEvaluation(1L, null, PageRequest.of(0, 20));

        assertThat(result.getContent()).hasSize(3);
        // Control 1 has an evaluation; controls 2 and 3 do not
        UtmComplianceControlLatestEvaluationDto dto1 = result.getContent().get(0);
        assertThat(dto1.getLastEvaluationStatus()).isEqualTo("pass");

        UtmComplianceControlLatestEvaluationDto dto2 = result.getContent().get(1);
        assertThat(dto2.getLastEvaluationStatus()).isNull();
    }

    private List<UtmComplianceControlConfig> createControls(int count) {
        List<UtmComplianceControlConfig> list = new ArrayList<>();
        for (int i = 1; i <= count; i++) {
            UtmComplianceControlConfig c = new UtmComplianceControlConfig();
            c.setId((long) i);
            c.setControlName("Control " + i);
            list.add(c);
        }
        return list;
    }
}
