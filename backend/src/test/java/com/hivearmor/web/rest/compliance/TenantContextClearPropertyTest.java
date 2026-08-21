package com.hivearmor.web.rest.compliance;

import com.hivearmor.domain.HaClient;
import com.hivearmor.multitenancy.TenantContext;
import com.hivearmor.repository.HaClientRepository;
import com.hivearmor.service.compliance.ComplianceReportGenerationService;
import net.jqwik.api.*;
import net.jqwik.api.lifecycle.AfterTry;
import net.jqwik.api.lifecycle.BeforeTry;
import org.junit.jupiter.api.Tag;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/**
 * Property P3 — TenantContext is cleared on every code path.
 *
 * <p>For every method modified in tasks 2.2 and 2.4, when the inner business call
 * throws an arbitrary {@link RuntimeException}, {@link TenantContext#getClientId()}
 * returns {@code null} after the method returns or the exception propagates.
 *
 * <p><strong>Validates: Requirements 6.4, 6.5, 8.1, 8.2, 8.4</strong>
 *
 * <p>Sprint 24 — S24-T02, task 2.5.
 */
@Tag("Feature: sprint-24-per-tenant-compliance")
@Label("Property P3: TenantContext is cleared on every code path including exceptions")
class TenantContextClearPropertyTest {

    private ComplianceReportGenerationService mockService;
    private HaClientRepository mockRepo;
    private ComplianceReportGenerationController controller;

    @BeforeTry
    void setUp() {
        mockService = mock(ComplianceReportGenerationService.class);
        mockRepo = mock(HaClientRepository.class);
        controller = new ComplianceReportGenerationController(mockService, mockRepo);
    }

    @AfterTry
    void tearDown() {
        TenantContext.clear();
    }

    // =========================================================================
    // Arbitraries
    // =========================================================================

    @Provide
    Arbitrary<Long> tenantIds() {
        return Arbitraries.longs().between(1L, 10_000L);
    }

    @Provide
    Arbitrary<String> prefixes() {
        return Arbitraries.strings()
                .withChars("abcdefghijklmnopqrstuvwxyz0123456789")
                .ofMinLength(1).ofMaxLength(16);
    }

    @Provide
    Arbitrary<String> exceptionMessages() {
        return Arbitraries.strings().ofMinLength(0).ofMaxLength(50);
    }

    // =========================================================================
    // P3a — TenantContext is cleared when service throws RuntimeException
    // Validates: Requirements 6.4, 6.5
    // =========================================================================

    /**
     * <strong>Validates: Requirements 6.4, 6.5</strong>
     *
     * <p>When {@code ComplianceReportGenerationService.generate()} throws an arbitrary
     * {@link RuntimeException}, the controller's {@code finally} block must ensure
     * {@code TenantContext.getClientId()} returns {@code null} after the exception
     * propagates — confirming the thread-local is never leaked.
     */
    @Property(tries = 100)
    @Label("P3a: TenantContext.getClientId() is null after service throws RuntimeException")
    void property3a_tenantContextClearedOnServiceException(
            @ForAll("tenantIds")        Long tenantId,
            @ForAll("prefixes")         String prefix,
            @ForAll("exceptionMessages") String message) {

        // Arrange: valid tenant found in repo
        HaClient tenant = buildClient(tenantId, prefix, "Test Corp");
        when(mockRepo.findById(tenantId)).thenReturn(Optional.of(tenant));

        // Arrange: service throws on every call
        when(mockService.generate(tenantId))
                .thenThrow(new RuntimeException("Simulated service failure: " + message));

        // Act + assert: the exception propagates but TenantContext is cleared afterwards
        assertThatThrownBy(() -> controller.generate(tenantId))
                .isInstanceOf(RuntimeException.class);

        // P3 core assertion: after the exception the ThreadLocal must be null (Req 6.4, 6.5)
        assertThat(TenantContext.getClientId())
                .as("TenantContext.getClientId() must be null after exception propagates")
                .isNull();
        assertThat(TenantContext.getClientPrefix())
                .as("TenantContext.getClientPrefix() must be null after exception propagates")
                .isNull();
    }

    // =========================================================================
    // P3b — TenantContext is cleared on the happy path too
    // Validates: Requirements 6.3
    // =========================================================================

    /**
     * <strong>Validates: Requirement 6.3</strong>
     *
     * <p>On a successful invocation (no exception), {@link TenantContext#getClientId()}
     * must also return {@code null} after the method returns — the {@code finally} block
     * runs regardless of whether an exception was thrown.
     */
    @Property(tries = 100)
    @Label("P3b: TenantContext.getClientId() is null after successful controller invocation")
    void property3b_tenantContextClearedOnSuccess(
            @ForAll("tenantIds") Long tenantId,
            @ForAll("prefixes")  String prefix) {

        // Arrange: valid tenant + service returns stub DTO
        HaClient tenant = buildClient(tenantId, prefix, "Test Corp");
        when(mockRepo.findById(tenantId)).thenReturn(Optional.of(tenant));

        com.hivearmor.service.dto.compliance.ComplianceReportDto stub =
                new com.hivearmor.service.dto.compliance.ComplianceReportDto();
        stub.setTenantId(tenantId);
        when(mockService.generate(tenantId)).thenReturn(stub);

        // Act
        controller.generate(tenantId);

        // P3 core assertion: TenantContext cleared after successful return
        assertThat(TenantContext.getClientId())
                .as("TenantContext.getClientId() must be null after successful return")
                .isNull();
        assertThat(TenantContext.getClientPrefix())
                .as("TenantContext.getClientPrefix() must be null after successful return")
                .isNull();
    }

    // =========================================================================
    // P3c — TenantContext is NOT contaminated before the controller is invoked
    // =========================================================================

    /**
     * Sanity check: {@link TenantContext} starts clean for every trial.
     * The {@link AfterTry} hook guarantees cleanup between trials.
     */
    @Property(tries = 50)
    @Label("P3c: TenantContext starts null at the beginning of every trial")
    void property3c_tenantContextStartsClean() {
        assertThat(TenantContext.getClientId()).isNull();
        assertThat(TenantContext.getClientPrefix()).isNull();
    }

    // =========================================================================
    // Helper
    // =========================================================================

    private static HaClient buildClient(Long id, String prefix, String name) {
        HaClient c = new HaClient();
        c.setId(id);
        c.setClientPrefix(prefix);
        c.setName(name);
        return c;
    }
}
