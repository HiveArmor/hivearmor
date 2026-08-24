package com.hivearmor.service;

import com.hivearmor.domain.HaLlmUsage;
import com.hivearmor.repository.HaLlmUsageRepository;
import com.hivearmor.service.dto.HaLlmUsageDTO;
import com.hivearmor.service.dto.HaLlmUsageSummaryDTO;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;

import java.time.Instant;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Unit tests for {@link HaLlmUsageService} — safe DTO mapping and summary aggregates.
 */
@ExtendWith(MockitoExtension.class)
class HaLlmUsageServiceTest {

    @Mock
    private HaLlmUsageRepository repository;

    private HaLlmUsageService service;

    @BeforeEach
    void setUp() {
        service = new HaLlmUsageService(repository);
    }

    @Test
    void findAllMapsSafeFieldsOnly() {
        HaLlmUsage row = sampleRow();
        Pageable pageable = PageRequest.of(0, 20);
        when(repository.findAll(any(Pageable.class)))
            .thenReturn(new PageImpl<>(List.of(row), pageable, 1));

        Page<HaLlmUsageDTO> page = service.findAll(pageable);

        assertThat(page.getContent()).hasSize(1);
        HaLlmUsageDTO dto = page.getContent().get(0);
        assertThat(dto.id()).isEqualTo(7L);
        assertThat(dto.promptId()).isEqualTo("soc-ai.triage");
        assertThat(dto.promptHash()).isEqualTo("abc123");
        assertThat(dto.promptTokens()).isEqualTo(10L);
        assertThat(dto.completionTokens()).isEqualTo(20L);
        assertThat(dto.totalTokens()).isEqualTo(30L);
        assertThat(dto.cascadeDecision()).isEqualTo(HaLlmUsage.DECISION_CALL_LLM);
        assertThat(dto.cascadeReason()).isEqualTo("CALL_LLM");
        assertThat(dto.userLogin()).isEqualTo("admin");
        assertThat(dto.createdAt()).isEqualTo(Instant.parse("2026-08-24T12:00:00Z"));
        verify(repository).findAll(pageable);
    }

    @Test
    void summarizeByCascadeDecisionReturnsCountsOnly() {
        when(repository.countGroupedByCascadeDecision()).thenReturn(List.of(
            new Object[] {HaLlmUsage.DECISION_CALL_LLM, 12L},
            new Object[] {HaLlmUsage.DECISION_SKIP_LLM, 3L}
        ));

        List<HaLlmUsageSummaryDTO> summary = service.summarizeByCascadeDecision();

        assertThat(summary).containsExactly(
            new HaLlmUsageSummaryDTO(HaLlmUsage.DECISION_CALL_LLM, 12L),
            new HaLlmUsageSummaryDTO(HaLlmUsage.DECISION_SKIP_LLM, 3L)
        );
    }

    @Test
    void toDtoNeverExposesUnknownEntityFields() {
        // Guard: DTO record components are the allow-list for the admin read API.
        assertThat(HaLlmUsageDTO.class.getRecordComponents())
            .extracting(c -> c.getName())
            .containsExactly(
                "id",
                "promptId",
                "promptHash",
                "promptTokens",
                "completionTokens",
                "totalTokens",
                "cascadeDecision",
                "cascadeReason",
                "userLogin",
                "createdAt"
            )
            .doesNotContain("promptBody", "prompt", "apiKey", "secret", "content", "messages");
    }

    private static HaLlmUsage sampleRow() {
        HaLlmUsage row = new HaLlmUsage();
        row.setId(7L);
        row.setPromptId("soc-ai.triage");
        row.setPromptHash("abc123");
        row.setPromptTokens(10L);
        row.setCompletionTokens(20L);
        row.setTotalTokens(30L);
        row.setCascadeDecision(HaLlmUsage.DECISION_CALL_LLM);
        row.setCascadeReason("CALL_LLM");
        row.setUserLogin("admin");
        row.setCreatedAt(Instant.parse("2026-08-24T12:00:00Z"));
        return row;
    }
}
