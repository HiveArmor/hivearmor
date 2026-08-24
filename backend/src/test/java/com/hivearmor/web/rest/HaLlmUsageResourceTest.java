package com.hivearmor.web.rest;

import com.hivearmor.domain.HaLlmUsage;
import com.hivearmor.service.HaLlmUsageService;
import com.hivearmor.service.dto.HaLlmUsageDTO;
import com.hivearmor.service.dto.HaLlmUsageSummaryDTO;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;

import java.time.Instant;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Resource tests for {@link HaLlmUsageResource} — ADMIN scope + safe list/summary.
 */
@ExtendWith(MockitoExtension.class)
class HaLlmUsageResourceTest {

    @Mock
    private HaLlmUsageService service;

    private HaLlmUsageResource resource;

    @BeforeEach
    void setUp() {
        resource = new HaLlmUsageResource(service);
    }

    @Test
    void classRequiresAdminAuthority() {
        PreAuthorize pre = HaLlmUsageResource.class.getAnnotation(PreAuthorize.class);
        assertThat(pre).isNotNull();
        assertThat(pre.value()).contains("ROLE_ADMIN");
    }

    @Test
    void getAllReturnsPageWithTotalCountHeader() {
        HaLlmUsageDTO dto = new HaLlmUsageDTO(
            1L,
            "prompt.a",
            "hash1",
            5L,
            7L,
            12L,
            HaLlmUsage.DECISION_CALL_LLM,
            "CALL_LLM",
            "admin",
            Instant.parse("2026-08-24T12:00:00Z")
        );
        Pageable pageable = PageRequest.of(0, 50);
        when(service.findAll(any(Pageable.class)))
            .thenReturn(new PageImpl<>(List.of(dto), pageable, 1));

        ResponseEntity<List<HaLlmUsageDTO>> response = resource.getAll(pageable);

        assertThat(response.getStatusCode().is2xxSuccessful()).isTrue();
        assertThat(response.getHeaders().getFirst("X-Total-Count")).isEqualTo("1");
        assertThat(response.getBody()).containsExactly(dto);
        verify(service).findAll(pageable);
    }

    @Test
    void getSummaryReturnsCascadeCounts() {
        List<HaLlmUsageSummaryDTO> summary = List.of(
            new HaLlmUsageSummaryDTO(HaLlmUsage.DECISION_CALL_LLM, 9L),
            new HaLlmUsageSummaryDTO(HaLlmUsage.DECISION_SKIP_LLM, 2L)
        );
        when(service.summarizeByCascadeDecision()).thenReturn(summary);

        ResponseEntity<List<HaLlmUsageSummaryDTO>> response = resource.getSummary();

        assertThat(response.getStatusCode().is2xxSuccessful()).isTrue();
        assertThat(response.getBody()).isEqualTo(summary);
        verify(service).summarizeByCascadeDecision();
    }
}
