package com.hivearmor.compliance.service;

import com.hivearmor.compliance.dto.ComplianceControlExceptionDTO;
import com.hivearmor.compliance.entity.HaComplianceException;
import com.hivearmor.repository.compliance.HaComplianceExceptionRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class HaComplianceExceptionServiceTest {

    private HaComplianceExceptionRepository repository;
    private HaComplianceExceptionService service;

    @BeforeEach
    void setUp() {
        repository = mock(HaComplianceExceptionRepository.class);
        service = new HaComplianceExceptionService(repository);
    }

    @Test
    void listByControlIdQueriesControlKeyAndProjectsDto() {
        HaComplianceException item = new HaComplianceException();
        item.setId(3L);
        item.setControlId(42L);
        item.setTitle("Legacy auth waiver");
        item.setReason("Migration window");
        item.setStatus("approved");
        item.setEffectiveFrom(LocalDate.of(2026, 7, 1));
        item.setEffectiveUntil(LocalDate.of(2026, 12, 31));
        item.setApprover("soc-manager");
        item.setCreatedAt(Instant.parse("2026-07-01T00:00:00Z"));
        item.setUpdatedAt(Instant.parse("2026-07-15T00:00:00Z"));

        PageRequest pageable = PageRequest.of(0, 20);
        when(repository.findByControlId(eq(42L), eq(pageable)))
            .thenReturn(new PageImpl<>(List.of(item), pageable, 1));

        var page = service.listByControlId(42L, pageable);

        verify(repository).findByControlId(42L, pageable);
        assertThat(page.getTotalElements()).isEqualTo(1);
        ComplianceControlExceptionDTO dto = page.getContent().get(0);
        assertThat(dto.id()).isEqualTo(3L);
        assertThat(dto.controlId()).isEqualTo(42L);
        assertThat(dto.title()).isEqualTo("Legacy auth waiver");
        assertThat(dto.status()).isEqualTo("approved");
        assertThat(dto.effectiveUntil()).isEqualTo(LocalDate.of(2026, 12, 31));
        assertThat(dto.approver()).isEqualTo("soc-manager");
    }
}
