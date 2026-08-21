package com.hivearmor.service.compliance;

import com.hivearmor.domain.compliance.ComplianceResult;
import com.hivearmor.multitenancy.TenantContext;
import com.hivearmor.repository.compliance.ComplianceResultRepository;
import net.jqwik.api.*;
import net.jqwik.api.lifecycle.AfterTry;
import net.jqwik.api.lifecycle.BeforeTry;
import org.junit.jupiter.api.Tag;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * Property P2 — {@code client_id} predicate is applied iff TenantContext is MSSP-scoped.
 *
 * <p><strong>Validates: Requirements 2.1, 2.2, 2.5, 2.6</strong>
 *
 * <h2>Properties covered</h2>
 * <ol>
 *   <li><strong>P2a — MSSP scope: listByFramework routes to scoped variant.</strong>
 *       For any {@code (clientId, prefix)} pair set on {@link TenantContext}, the service
 *       calls {@code findByFrameworkAndClientId(framework, clientId)} exactly once, never
 *       calls the unscoped {@code findByFramework}, and every returned row satisfies
 *       {@code row.clientId == clientId}. Requirement 2.1.</li>
 *   <li><strong>P2b — MSSP scope: listAllOrderedByEvaluatedAt routes to scoped variant.</strong>
 *       Same dispatch guarantee for the second service method. Requirement 2.1.</li>
 *   <li><strong>P2c — No scope: listByFramework calls unscoped variant, row set unrestricted.</strong>
 *       When {@link TenantContext} is cleared, the service calls the unscoped
 *       {@code findByFramework} variant and returns the full seed list regardless of the
 *       {@code clientId} values carried by the rows. Requirement 2.2.</li>
 *   <li><strong>P2d — No scope: listAllOrderedByEvaluatedAt calls unscoped variant.</strong>
 *       Same unscoped dispatch for the second method. Requirement 2.2.</li>
 * </ol>
 *
 * <h2>Design</h2>
 * <p>Uses pure Mockito (no Spring context, no embedded database) to stub
 * {@link ComplianceResultRepository} and exercises {@link ComplianceResultQueryService}
 * directly. Every jqwik trial starts from a clean mock state thanks to {@link BeforeTry}
 * and always clears {@link TenantContext} in {@link AfterTry}.
 *
 * <p>Sprint 24 — S24-T01, task 1.6.
 */
@Tag("Feature: sprint-24-per-tenant-compliance")
@Label("Feature: sprint-24-per-tenant-compliance, Property P2: client_id predicate applied iff TenantContext is MSSP-scoped")
class ComplianceResultRepositoryClientIdPropertyTest {

    // -------------------------------------------------------------------------
    // Collaborators — re-created fresh for every jqwik trial via @BeforeTry
    // -------------------------------------------------------------------------

    private ComplianceResultRepository repository;
    private ComplianceResultQueryService service;

    @BeforeTry
    void setUp() {
        repository = mock(ComplianceResultRepository.class);
        service    = new ComplianceResultQueryService(repository);
    }

    /**
     * Always clear TenantContext after each trial so a leaked scope cannot bleed
     * into subsequent trials or other tests running in the same JVM thread.
     */
    @AfterTry
    void tearDown() {
        TenantContext.clear();
    }

    // =========================================================================
    // Arbitraries
    // =========================================================================

    /**
     * Generates a valid {@code ha_client.id} — any positive Long in [1, 10_000].
     */
    @Provide
    Arbitrary<Long> clientIds() {
        return Arbitraries.longs().between(1L, 10_000L);
    }

    /**
     * Generates a valid {@code client_prefix}: {@code [a-z0-9-]{1,32}} with no
     * leading or trailing hyphen, matching the Sprint 21 validation rules.
     */
    @Provide
    Arbitrary<String> clientPrefixes() {
        return Arbitraries.strings()
                .withChars("abcdefghijklmnopqrstuvwxyz0123456789-")
                .ofMinLength(1).ofMaxLength(32)
                .filter(s -> !s.startsWith("-") && !s.endsWith("-"));
    }

    /**
     * Generates a list of N {@link ComplianceResult} rows (N in [1, 20]) where every
     * row carries the same {@code clientId}. The clientId is encoded as the base of the
     * row IDs so it is reproducible across trials.
     *
     * <p>The arbitrary uses a fixed clientId drawn from [1, 500] so that the combined
     * (clientId, rows) pair is coherent: all rows share that same clientId.
     */
    @Provide
    Arbitrary<List<ComplianceResult>> rowsForSingleClientId() {
        return Combinators.combine(
                Arbitraries.longs().between(1L, 500L),   // clientId
                Arbitraries.integers().between(1, 20)    // row count N
        ).as((cid, n) -> buildRows(cid, n, "SOC 2"));
    }

    /**
     * Generates a mixed list of N {@link ComplianceResult} rows (N in [2, 20]) where
     * rows carry up to five distinct {@code clientId} values. Used to verify the
     * unscoped path returns all rows without applying a {@code client_id} filter.
     */
    @Provide
    Arbitrary<List<ComplianceResult>> mixedRows() {
        return Combinators.combine(
                Arbitraries.longs().between(1L, 200L),   // clientId pool base
                Arbitraries.integers().between(2, 20)    // row count N
        ).as((base, n) -> {
            List<ComplianceResult> rows = new ArrayList<>(n);
            for (int i = 0; i < n; i++) {
                ComplianceResult cr = new ComplianceResult();
                cr.setId((long) (i + 1));
                cr.setControlId((long) (i + 100));
                cr.setControlName("Control-" + i);
                cr.setFramework("HIPAA");
                cr.setStatus("FAIL");
                cr.setEvaluatedAt(Instant.ofEpochSecond(1_700_000_000L + i));
                cr.setClientId(base + (i % 5));   // spread across up to 5 distinct ids
                rows.add(cr);
            }
            return rows;
        });
    }

    // =========================================================================
    // P2a — MSSP scope: listByFramework calls scoped variant and all rows match
    // Validates: Requirements 2.1, 2.5
    // =========================================================================

    /**
     * **Validates: Requirements 2.1, 2.5**
     *
     * <p>For any MSSP-scoped context with {@code clientId} C and prefix P:
     * <ol>
     *   <li>{@code listByFramework()} calls
     *       {@code findByFrameworkAndClientId(framework, C)} exactly once.</li>
     *   <li>The unscoped variant {@code findByFramework(framework)} is never called.</li>
     *   <li>Every row in the returned list satisfies {@code row.clientId == C}.</li>
     * </ol>
     */
    @Property(tries = 100)
    @Label("P2a: MSSP scope — listByFramework routes to findByFrameworkAndClientId and all rows have correct clientId")
    void property2a_msspScope_listByFramework_routesToScopedVariant(
            @ForAll("rowsForSingleClientId") List<ComplianceResult> rows,
            @ForAll("clientPrefixes")        String prefix) {

        Long clientId = rows.get(0).getClientId();

        // Stub: scoped method returns the generated rows for this clientId.
        when(repository.findByFrameworkAndClientId(anyString(), eq(clientId)))
                .thenReturn(rows);

        // Establish MSSP scope.
        TenantContext.set(clientId, prefix);

        // Act
        List<ComplianceResult> result = service.listByFramework("SOC 2");

        // Scoped variant called exactly once with the correct clientId.
        verify(repository, times(1)).findByFrameworkAndClientId("SOC 2", clientId);

        // Unscoped variant must never be called.
        verify(repository, never()).findByFramework(anyString());

        // Every returned row must belong to this tenant.
        assertThat(result)
                .as("listByFramework under MSSP scope must return only rows with clientId=%d", clientId)
                .isNotEmpty()
                .allSatisfy(row ->
                        assertThat(row.getClientId())
                                .as("row.clientId must equal the scoped clientId")
                                .isEqualTo(clientId));
    }

    // =========================================================================
    // P2b — MSSP scope: listAllOrderedByEvaluatedAt calls scoped variant
    // Validates: Requirements 2.1, 2.5
    // =========================================================================

    /**
     * **Validates: Requirements 2.1, 2.5**
     *
     * <p>For any MSSP-scoped context with {@code clientId} C and prefix P:
     * <ol>
     *   <li>{@code listAllOrderedByEvaluatedAt()} calls
     *       {@code findByClientIdOrderByEvaluatedAtAsc(C)} exactly once.</li>
     *   <li>The unscoped variant {@code findAllOrderByEvaluatedAtDesc()} is never called.</li>
     *   <li>Every row in the returned list satisfies {@code row.clientId == C}.</li>
     * </ol>
     */
    @Property(tries = 100)
    @Label("P2b: MSSP scope — listAllOrderedByEvaluatedAt routes to findByClientIdOrderByEvaluatedAtAsc")
    void property2b_msspScope_listAll_routesToScopedVariant(
            @ForAll("rowsForSingleClientId") List<ComplianceResult> rows,
            @ForAll("clientPrefixes")        String prefix) {

        Long clientId = rows.get(0).getClientId();

        // Stub: scoped method returns the generated rows.
        when(repository.findByClientIdOrderByEvaluatedAtAsc(clientId))
                .thenReturn(rows);

        // Establish MSSP scope.
        TenantContext.set(clientId, prefix);

        // Act
        List<ComplianceResult> result = service.listAllOrderedByEvaluatedAt();

        // Scoped variant called exactly once.
        verify(repository, times(1)).findByClientIdOrderByEvaluatedAtAsc(clientId);

        // Unscoped variant must never be called.
        verify(repository, never()).findAllOrderByEvaluatedAtDesc();

        // Every returned row must belong to this tenant.
        assertThat(result)
                .as("listAllOrderedByEvaluatedAt under MSSP scope must return only rows with clientId=%d", clientId)
                .isNotEmpty()
                .allSatisfy(row ->
                        assertThat(row.getClientId())
                                .as("row.clientId must equal the scoped clientId")
                                .isEqualTo(clientId));
    }

    // =========================================================================
    // P2c — No scope: listByFramework calls unscoped variant, no clientId restriction
    // Validates: Requirements 2.2, 2.6
    // =========================================================================

    /**
     * **Validates: Requirements 2.2, 2.6**
     *
     * <p>When {@link TenantContext} is not set (no MSSP scope):
     * <ol>
     *   <li>{@code listByFramework()} calls the unscoped {@code findByFramework(framework)}
     *       exactly once.</li>
     *   <li>The scoped variant {@code findByFrameworkAndClientId} is never called.</li>
     *   <li>The returned row set is not restricted by {@code client_id}: it equals the
     *       full mixed-clientId seed list.</li>
     * </ol>
     */
    @Property(tries = 100)
    @Label("P2c: No scope — listByFramework calls findByFramework and returns unrestricted row set")
    void property2c_noScope_listByFramework_callsUnscopedVariant(
            @ForAll("mixedRows") List<ComplianceResult> rows) {

        // No TenantContext.set() call — TenantContext.isMssp() returns false.
        when(repository.findByFramework("HIPAA")).thenReturn(rows);

        // Act
        List<ComplianceResult> result = service.listByFramework("HIPAA");

        // Unscoped variant called exactly once.
        verify(repository, times(1)).findByFramework("HIPAA");

        // Scoped variant must never be called.
        verify(repository, never()).findByFrameworkAndClientId(anyString(), any());

        // Row set must equal the full seed — not filtered by any client_id predicate.
        assertThat(result)
                .as("listByFramework without tenant scope must return the full unfiltered row set")
                .containsExactlyElementsOf(rows);
    }

    // =========================================================================
    // P2d — No scope: listAllOrderedByEvaluatedAt calls unscoped variant
    // Validates: Requirements 2.2, 2.6
    // =========================================================================

    /**
     * **Validates: Requirements 2.2, 2.6**
     *
     * <p>When {@link TenantContext} is not set (no MSSP scope):
     * <ol>
     *   <li>{@code listAllOrderedByEvaluatedAt()} calls the unscoped
     *       {@code findAllOrderByEvaluatedAtDesc()} exactly once.</li>
     *   <li>The scoped variant {@code findByClientIdOrderByEvaluatedAtAsc} is never
     *       called.</li>
     *   <li>The returned row set equals the full mixed-clientId seed.</li>
     * </ol>
     */
    @Property(tries = 100)
    @Label("P2d: No scope — listAllOrderedByEvaluatedAt calls findAllOrderByEvaluatedAtDesc and returns unrestricted row set")
    void property2d_noScope_listAll_callsUnscopedVariant(
            @ForAll("mixedRows") List<ComplianceResult> rows) {

        // No TenantContext.set() call — TenantContext.isMssp() returns false.
        when(repository.findAllOrderByEvaluatedAtDesc()).thenReturn(rows);

        // Act
        List<ComplianceResult> result = service.listAllOrderedByEvaluatedAt();

        // Unscoped variant called exactly once.
        verify(repository, times(1)).findAllOrderByEvaluatedAtDesc();

        // Scoped variant must never be called.
        verify(repository, never()).findByClientIdOrderByEvaluatedAtAsc(any());

        // Row set must equal the full seed — not filtered by any client_id predicate.
        assertThat(result)
                .as("listAllOrderedByEvaluatedAt without tenant scope must return the full unfiltered row set")
                .containsExactlyElementsOf(rows);
    }

    // =========================================================================
    // Helper
    // =========================================================================

    private static List<ComplianceResult> buildRows(long clientId, int n, String framework) {
        List<ComplianceResult> rows = new ArrayList<>(n);
        for (int i = 0; i < n; i++) {
            ComplianceResult cr = new ComplianceResult();
            cr.setId((long) (i + 1));
            cr.setControlId((long) (i + 100));
            cr.setControlName("Control-" + i);
            cr.setFramework(framework);
            cr.setStatus("PASS");
            cr.setEvaluatedAt(Instant.ofEpochSecond(1_700_000_000L + i));
            cr.setClientId(clientId);
            rows.add(cr);
        }
        return rows;
    }
}
