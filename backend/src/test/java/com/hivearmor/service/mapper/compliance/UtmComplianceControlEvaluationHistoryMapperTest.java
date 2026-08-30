package com.hivearmor.service.mapper.compliance;

import com.hivearmor.service.dto.compliance.UtmComplianceControlEvaluationHistoryDto;
import org.junit.jupiter.api.Test;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class UtmComplianceControlEvaluationHistoryMapperTest {

    @Test
    void mapToEvaluationDto_mapsSnakeCaseEvaluationDocument() {
        Map<String, Object> src = new HashMap<>();
        src.put("control_id", 42L);
        src.put("control_name", "AC-1");
        src.put("status", "PASS");
        src.put("timestamp", "2026-01-15T12:00:00Z");
        src.put("query_evaluations", List.of(Map.of(
                "queryConfigId", 7,
                "queryName", "q1",
                "evaluationRule", "NO_HITS_ALLOWED",
                "hits", 0,
                "status", "PASS"
        )));

        UtmComplianceControlEvaluationHistoryDto dto =
                UtmComplianceControlEvaluationHistoryMapper.mapToEvaluationDto(src);

        assertThat(dto).isNotNull();
        assertThat(dto.getControlId()).isEqualTo(42L);
        assertThat(dto.getControlName()).isEqualTo("AC-1");
        assertThat(dto.getStatus()).isEqualTo("PASS");
        assertThat(dto.getQueryEvaluations()).hasSize(1);
    }

    @Test
    void mapToEvaluationDto_documentWithoutControlIdReturnsNull() {
        Map<String, Object> doc = Map.of(
                "mappingType", "EVIDENCE",
                "@timestamp", "2026-01-15T12:00:00Z"
        );

        assertThat(UtmComplianceControlEvaluationHistoryMapper.mapToEvaluationDto(doc)).isNull();
    }

    @Test
    void mapToEvaluationDto_nullSourceReturnsNull() {
        assertThat(UtmComplianceControlEvaluationHistoryMapper.mapToEvaluationDto(null)).isNull();
    }
}
