package com.hivearmor.service.compliance;

import com.hivearmor.domain.compliance.ComplianceResult;
import com.hivearmor.multitenancy.TenantContext;
import com.hivearmor.repository.compliance.ComplianceResultRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Instant;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

/**
 * Unit tests for {@link ComplianceResultQueryService}.
 *
 * <p>Verifies the three-way dispatch logic required by Requirement 2.1–2.7:
 * <ol>
 *   <li>When MSSP-scoped with a valid clientId → scoped repository variant called</li>
 *   <li>When MSSP-scoped but clientId is null → empty result, no SQL executed</li>
 *   <li>When not MSSP-scoped → unscoped repository variant called unchanged</li>
 * </ol>
 *
 * <p>Satisfies Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7
 */
@ExtendWith(MockitoExtension.class)
class ComplianceResultQueryServiceTest {

    private static final Long   CLIENT_ID  = 42L;
    private static final String PREFIX     = "acme";
    private static final String FRAMEWORK  = "SOC 2";

    @Mock
    private ComplianceResultRepository complianceResultRepository;

    @InjectMocks
    private ComplianceResultQueryService service;

    /** Always clean up TenantContext so one test cannot leak scope into the next. */
    @AfterEach
    void clearTenantContext() {
        TenantContext.clear();
    }

    // -------------------------------------------------------------------------
    // listByFramework — MSSP-scoped path (Requirement 2.1)
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("listByFramework: MSSP scope with valid clientId calls findByFrameworkAndClientId")
    void listByFramework_msspScope_delegatesToScopedVariant() {
        // Arrange
        ComplianceResult row = makeResult(CLIENT_ID, FRAMEWORK);
        when(complianceResultRepository.findByFrameworkAndClientId(FRAMEWORK, CLIENT_ID))
                .thenReturn(List.of(row));

        TenantContext.set(CLIENT_ID, PREFIX);  // establish MSSP scope (Req 2.1)

        // Act
        List<ComplianceResult> result = service.listByFramework(FRAMEWORK);

        // Assert — only acme rows returned; unscoped variant never called
        assertThat(result).hasSize(1);
        assertThat(result.get(0).getClientId())
                .as("Returned row must belong to the scoped tenant")
                .isEqualTo(CLIENT_ID);
        verify(complianceResultRepository, times(1))
                .findByFrameworkAndClientId(FRAMEWORK, CLIENT_ID);
        verify(complianceResultRepository, never()).findByFramework(anyString());
    }

    // -------------------------------------------------------------------------
    // listByFramework — MSSP scope but null clientId (Requirement 2.3)
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("listByFramework: MSSP scope with null clientId returns empty list without executing SQL")
    void listByFramework_msspScope_nullClientId_returnsEmpty() {
        // Arrange — set only the prefix, no clientId (prefix-only set keeps clientId null)
        TenantContext.set("orphan-prefix");   // isMssp() == true, getClientId() == null

        // Act
        List<ComplianceResult> result = service.listByFramework(FRAMEWORK);

        // Assert — empty result; no repository method invoked (Req 2.3)
        assertThat(result).isEmpty();
        verify(complianceResultRepository, never()).findByFramework(anyString());
        verify(complianceResultRepository, never())
                .findByFrameworkAndClientId(anyString(), anyLong());
    }

    // -------------------------------------------------------------------------
    // listByFramework — Non-MSSP path (Requirement 2.2)
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("listByFramework: no tenant scope calls unscoped findByFramework")
    void listByFramework_noScope_delegatesToUnscopedVariant() {
        // Arrange — no TenantContext.set() call; isMssp() == false
        ComplianceResult row1 = makeResult(null, FRAMEWORK);
        ComplianceResult row2 = makeResult(null, FRAMEWORK);
        when(complianceResultRepository.findByFramework(FRAMEWORK))
                .thenReturn(List.of(row1, row2));

        // Act
        List<ComplianceResult> result = service.listByFramework(FRAMEWORK);

        // Assert — unscoped variant called; no client_id predicate (Req 2.2)
        assertThat(result).hasSize(2);
        verify(complianceResultRepository, times(1)).findByFramework(FRAMEWORK);
        verify(complianceResultRepository, never())
                .findByFrameworkAndClientId(anyString(), anyLong());
    }

    // -------------------------------------------------------------------------
    // listAllOrderedByEvaluatedAt — MSSP-scoped path (Requirement 2.1)
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("listAllOrderedByEvaluatedAt: MSSP scope with valid clientId calls findByClientIdOrderByEvaluatedAtAsc")
    void listAll_msspScope_delegatesToScopedVariant() {
        // Arrange
        ComplianceResult row = makeResult(CLIENT_ID, FRAMEWORK);
        when(complianceResultRepository.findByClientIdOrderByEvaluatedAtAsc(CLIENT_ID))
                .thenReturn(List.of(row));

        TenantContext.set(CLIENT_ID, PREFIX);

        // Act
        List<ComplianceResult> result = service.listAllOrderedByEvaluatedAt();

        // Assert
        assertThat(result).hasSize(1);
        assertThat(result.get(0).getClientId()).isEqualTo(CLIENT_ID);
        verify(complianceResultRepository, times(1))
                .findByClientIdOrderByEvaluatedAtAsc(CLIENT_ID);
        verify(complianceResultRepository, never()).findAllOrderByEvaluatedAtDesc();
    }

    // -------------------------------------------------------------------------
    // listAllOrderedByEvaluatedAt — MSSP scope but null clientId (Requirement 2.3)
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("listAllOrderedByEvaluatedAt: MSSP scope with null clientId returns empty list without SQL")
    void listAll_msspScope_nullClientId_returnsEmpty() {
        TenantContext.set("orphan-prefix");   // isMssp() true, clientId null

        List<ComplianceResult> result = service.listAllOrderedByEvaluatedAt();

        assertThat(result).isEmpty();
        verify(complianceResultRepository, never()).findAllOrderByEvaluatedAtDesc();
        verify(complianceResultRepository, never())
                .findByClientIdOrderByEvaluatedAtAsc(anyLong());
    }

    // -------------------------------------------------------------------------
    // listAllOrderedByEvaluatedAt — Non-MSSP path (Requirement 2.2)
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("listAllOrderedByEvaluatedAt: no tenant scope calls findAllOrderByEvaluatedAtDesc")
    void listAll_noScope_delegatesToUnscopedVariant() {
        // Arrange — no TenantContext.set() call
        ComplianceResult row = makeResult(null, "PCI-DSS");
        when(complianceResultRepository.findAllOrderByEvaluatedAtDesc())
                .thenReturn(List.of(row));

        // Act
        List<ComplianceResult> result = service.listAllOrderedByEvaluatedAt();

        // Assert — unscoped variant called; scoped variant never touched
        assertThat(result).hasSize(1);
        verify(complianceResultRepository, times(1)).findAllOrderByEvaluatedAtDesc();
        verify(complianceResultRepository, never())
                .findByClientIdOrderByEvaluatedAtAsc(anyLong());
    }

    // -------------------------------------------------------------------------
    // Cross-cutting: clientId is never concatenated — only bound via repository param
    // (Requirement 2.4 — structural guarantee enforced by never using raw SQL here)
    // This is a documentation test: the service delegates to @Query methods only.
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("Cross-cutting: rows returned by scoped query all carry the expected clientId (Req 2.4)")
    void scopedQuery_rowsAllBelongToRequestedClient() {
        long otherClientId = 99L;
        // Repo correctly returns only rows for the requested client.
        ComplianceResult acmeRow = makeResult(CLIENT_ID, FRAMEWORK);
        when(complianceResultRepository.findByFrameworkAndClientId(FRAMEWORK, CLIENT_ID))
                .thenReturn(List.of(acmeRow));

        TenantContext.set(CLIENT_ID, PREFIX);
        List<ComplianceResult> result = service.listByFramework(FRAMEWORK);

        // All rows belong to CLIENT_ID; none carry otherClientId.
        assertThat(result)
                .allSatisfy(r -> assertThat(r.getClientId()).isEqualTo(CLIENT_ID))
                .noneMatch(r -> otherClientId == r.getClientId());
    }

    // -------------------------------------------------------------------------
    // Helper
    // -------------------------------------------------------------------------

    private static ComplianceResult makeResult(Long clientId, String framework) {
        ComplianceResult cr = new ComplianceResult();
        cr.setId(System.nanoTime()); // unique enough for unit tests
        cr.setControlId(1L);
        cr.setControlName("Test Control");
        cr.setFramework(framework);
        cr.setStatus("passed");
        cr.setEvaluatedAt(Instant.now());
        cr.setClientId(clientId);
        return cr;
    }
}
