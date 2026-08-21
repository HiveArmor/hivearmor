package com.hivearmor.web.rest.compliance;

import com.hivearmor.domain.HaClient;
import com.hivearmor.multitenancy.TenantContext;
import com.hivearmor.repository.HaClientRepository;
import com.hivearmor.service.compliance.ComplianceReportGenerationService;
import com.hivearmor.service.dto.compliance.ComplianceReportDto;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowable;
import static org.mockito.Mockito.*;

/**
 * Property test P3 — TenantContext is cleared on every code path through
 * {@link ComplianceReportGenerationController#generate(Long)}.
 *
 * <p>Validates Requirements 6.4, 6.5, 8.1, 8.2, 8.4: the thread-local tenant scope
 * established by {@code TenantContext.set()} must always be released in the
 * {@code finally} block, regardless of whether the inner service call succeeds or
 * throws any {@link RuntimeException} subtype.
 *
 * <p>Sprint 24 — S24-T02 task 2.5.
 *
 * <p><b>Validates: Requirements 6.4, 6.5, 8.1, 8.2, 8.4</b>
 */
@ExtendWith(MockitoExtension.class)
class ComplianceReportGenerationControllerClearPropertyTest {

    @Mock
    private ComplianceReportGenerationService service;

    @Mock
    private HaClientRepository haClientRepository;

    @AfterEach
    void cleanup() {
        TenantContext.clear();
    }

    /**
     * Provides a representative set of {@link RuntimeException} subtypes that the
     * service layer might throw. Each one exercises a different exception type to
     * verify that the {@code finally} block in the controller fires for all of them.
     *
     * <p><b>Validates: Requirements 6.4, 6.5</b>
     */
    static Stream<RuntimeException> runtimeExceptions() {
        return Stream.of(
            new RuntimeException("generic error"),
            new IllegalStateException("illegal state"),
            new NullPointerException("npe"),
            new IllegalArgumentException("bad arg"),
            new UnsupportedOperationException("unsupported")
        );
    }

    /**
     * P3 — For each RuntimeException subtype, verifies that
     * {@code TenantContext.getClientId()} returns {@code null} after the exception
     * propagates out of {@code generate()}.
     *
     * <p>The controller sets the tenant context before the {@code try} block and clears
     * it in the matching {@code finally} block. This test confirms that the
     * {@code finally} executes even when the service throws.
     *
     * <p><b>Validates: Requirements 6.4, 6.5, 8.1, 8.2, 8.4</b>
     */
    @ParameterizedTest(name = "P3: TenantContext cleared after {0}")
    @MethodSource("runtimeExceptions")
    @DisplayName("P3: TenantContext.getClientId() is null after service throws")
    void p3_contextClearedAfterException(RuntimeException ex) {
        HaClient tenant = new HaClient();
        tenant.setId(42L);
        tenant.setClientPrefix("acme");
        tenant.setName("Acme Corp");

        when(haClientRepository.findById(42L)).thenReturn(Optional.of(tenant));
        when(service.generate(42L)).thenThrow(ex);

        ComplianceReportGenerationController controller =
            new ComplianceReportGenerationController(service, haClientRepository);

        catchThrowable(() -> controller.generate(42L));

        assertThat(TenantContext.getClientId())
            .as("TenantContext.getClientId() must be null after exception propagates")
            .isNull();
    }

    /**
     * P3 (happy path) — Verifies that {@code TenantContext.getClientId()} returns
     * {@code null} after a successful invocation of {@code generate()}.
     *
     * <p>Confirms that the {@code finally} block clears context on the normal exit path
     * as well, not only on the exception path.
     *
     * <p><b>Validates: Requirements 6.4, 6.5, 8.1, 8.2, 8.4</b>
     */
    @Test
    @DisplayName("P3: TenantContext.getClientId() is null after successful generate()")
    void p3_contextClearedAfterSuccess() {
        HaClient tenant = new HaClient();
        tenant.setId(10L);
        tenant.setClientPrefix("beta");
        tenant.setName("Beta Inc");

        when(haClientRepository.findById(10L)).thenReturn(Optional.of(tenant));
        when(service.generate(10L)).thenReturn(new ComplianceReportDto());

        ComplianceReportGenerationController controller =
            new ComplianceReportGenerationController(service, haClientRepository);

        controller.generate(10L);

        assertThat(TenantContext.getClientId())
            .as("TenantContext.getClientId() must be null after successful generate()")
            .isNull();
    }
}
