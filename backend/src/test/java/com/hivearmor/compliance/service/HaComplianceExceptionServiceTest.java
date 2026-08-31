package com.hivearmor.compliance.service;

import com.hivearmor.compliance.dto.ComplianceControlExceptionDTO;
import com.hivearmor.compliance.dto.CreateComplianceExceptionRequest;
import com.hivearmor.compliance.entity.HaComplianceException;
import com.hivearmor.repository.compliance.HaComplianceExceptionRepository;
import jakarta.persistence.EntityNotFoundException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
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

    @Test
    void createStartsPendingException() {
        when(repository.save(any(HaComplianceException.class))).thenAnswer(invocation -> {
            HaComplianceException saved = invocation.getArgument(0);
            saved.setId(11L);
            saved.setCreatedAt(Instant.parse("2026-08-31T12:00:00Z"));
            saved.setUpdatedAt(Instant.parse("2026-08-31T12:00:00Z"));
            return saved;
        });

        ComplianceControlExceptionDTO dto = service.create(
            new CreateComplianceExceptionRequest(
                42L,
                "Vendor SLA exception",
                "Temporary cadence gap",
                LocalDate.of(2026, 8, 31),
                LocalDate.of(2026, 12, 31)
            )
        );

        assertThat(dto.status()).isEqualTo("pending");
        assertThat(dto.title()).isEqualTo("Vendor SLA exception");
    }

    @Test
    void approveSetsApproverAndStatus() {
        HaComplianceException existing = pendingException(5L);
        when(repository.findById(5L)).thenReturn(Optional.of(existing));
        when(repository.save(existing)).thenReturn(existing);

        ComplianceControlExceptionDTO dto = service.approve(5L, "admin");

        assertThat(dto.status()).isEqualTo("approved");
        assertThat(dto.approver()).isEqualTo("admin");
    }

    @Test
    void rejectFromPending() {
        HaComplianceException existing = pendingException(6L);
        when(repository.findById(6L)).thenReturn(Optional.of(existing));
        when(repository.save(existing)).thenReturn(existing);

        ComplianceControlExceptionDTO dto = service.reject(6L, "soc-manager");

        assertThat(dto.status()).isEqualTo("rejected");
        assertThat(dto.approver()).isEqualTo("soc-manager");
    }

    @Test
    void revokeFromApprovedOnly() {
        HaComplianceException existing = pendingException(7L);
        existing.setStatus("approved");
        when(repository.findById(7L)).thenReturn(Optional.of(existing));
        when(repository.save(existing)).thenReturn(existing);

        ComplianceControlExceptionDTO dto = service.revoke(7L, "admin");

        assertThat(dto.status()).isEqualTo("revoked");
    }

    @Test
    void revokeRejectsPendingState() {
        HaComplianceException existing = pendingException(8L);
        when(repository.findById(8L)).thenReturn(Optional.of(existing));

        assertThatThrownBy(() -> service.revoke(8L, "admin")).isInstanceOf(IllegalStateException.class);
    }

    @Test
    void deleteThrowsWhenMissing() {
        when(repository.existsById(404L)).thenReturn(false);
        assertThatThrownBy(() -> service.delete(404L)).isInstanceOf(EntityNotFoundException.class);
    }

    private static HaComplianceException pendingException(Long id) {
        HaComplianceException item = new HaComplianceException();
        item.setId(id);
        item.setControlId(42L);
        item.setTitle("Pending waiver");
        item.setStatus("pending");
        item.setCreatedAt(Instant.parse("2026-08-31T12:00:00Z"));
        item.setUpdatedAt(Instant.parse("2026-08-31T12:00:00Z"));
        return item;
    }
}
