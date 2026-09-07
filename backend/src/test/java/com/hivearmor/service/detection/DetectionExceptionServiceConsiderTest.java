package com.hivearmor.service.detection;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.domain.detection.HaDetectionException;
import com.hivearmor.repository.detection.HaDetectionExceptionRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class DetectionExceptionServiceConsiderTest {

    @Mock
    private HaDetectionExceptionRepository repository;

    private DetectionExceptionService service;

    @BeforeEach
    void setUp() {
        service = new DetectionExceptionService(repository, new ObjectMapper());
    }

    @Test
    void consider_blankRuleId_notApplied() {
        DetectionExceptionConsideration result = service.consider("  ", Map.of("host", Map.of("name", "x")));
        assertThat(result.exceptionsApplied()).isFalse();
        assertThat(result.suppressed()).isFalse();
        assertThat(result.honesty()).contains("exceptionsApplied=false");
    }

    @Test
    void consider_storeUnavailable_notApplied() {
        when(repository.findByRuleIdAndActiveTrue("42")).thenThrow(new RuntimeException("db down"));
        DetectionExceptionConsideration result = service.consider("42", Map.of());
        assertThat(result.exceptionsApplied()).isFalse();
        assertThat(result.honesty()).contains("Exception store unavailable");
    }

    @Test
    void consider_activeExceptionMatches_suppressed() {
        HaDetectionException entity = new HaDetectionException();
        entity.setId(9001L);
        entity.setRuleId("42");
        entity.setTitle("Approved scanner");
        entity.setActive(true);
        entity.setConditionsJson("[{\"field\":\"host.name\",\"operator\":\"is\",\"value\":\"approved-scanner\"}]");
        when(repository.findByRuleIdAndActiveTrue("42")).thenReturn(List.of(entity));

        DetectionExceptionConsideration result = service.consider("42",
            Map.of("host", Map.of("name", "approved-scanner")));

        assertThat(result.exceptionsApplied()).isTrue();
        assertThat(result.suppressed()).isTrue();
        assertThat(result.matchingExceptionId()).isEqualTo(9001L);
        assertThat(result.matchingExceptionTitle()).isEqualTo("Approved scanner");
    }

    @Test
    void consider_loadedButNoMatch_appliedTrue() {
        HaDetectionException entity = new HaDetectionException();
        entity.setId(1L);
        entity.setTitle("Approved scanner");
        entity.setConditionsJson("[{\"field\":\"host.name\",\"operator\":\"is\",\"value\":\"approved-scanner\"}]");
        when(repository.findByRuleIdAndActiveTrue("42")).thenReturn(List.of(entity));

        DetectionExceptionConsideration result = service.consider("42",
            Map.of("host", Map.of("name", "FIN-WKS-044")));

        assertThat(result.exceptionsApplied()).isTrue();
        assertThat(result.suppressed()).isFalse();
        assertThat(result.consideredCount()).isEqualTo(1);
    }

    @Test
    void consider_emptyActiveList_appliedTrue() {
        when(repository.findByRuleIdAndActiveTrue("42")).thenReturn(List.of());
        DetectionExceptionConsideration result = service.consider("42", Map.of());
        assertThat(result.exceptionsApplied()).isTrue();
        assertThat(result.suppressed()).isFalse();
        assertThat(result.consideredCount()).isEqualTo(0);
    }

    @Test
    void extractRuleId_fromDefinitionAndBody() {
        assertThat(DetectionExceptionService.extractRuleId(Map.of("id", 12), null)).isEqualTo("12");
        assertThat(DetectionExceptionService.extractRuleId(Map.of("ruleId", "baseline:anomaly"), null))
            .isEqualTo("baseline:anomaly");
        assertThat(DetectionExceptionService.extractRuleId(Map.of(), Map.of("ruleId", "7"))).isEqualTo("7");
        assertThat(DetectionExceptionService.extractRuleId(null, null)).isNull();
    }
}
