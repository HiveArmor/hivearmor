package com.hivearmor.service.mssp;

import com.hivearmor.domain.HaClient;
import com.hivearmor.domain.compliance.ComplianceResult;
import com.hivearmor.repository.HaClientRepository;
import com.hivearmor.repository.compliance.ComplianceResultRepository;
import com.hivearmor.repository.compliance.ComplianceRollup;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.io.ByteArrayInputStream;
import java.util.Collections;
import java.util.List;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

/**
 * Property P4 — Workbook sheet count and ordering are pure functions of {@code ha_client}.
 *
 * <p>For any set of managed tenants {@code T}, {@code buildAggregateWorkbook()} produces
 * a workbook where:
 * <ul>
 *   <li>Sheet 0 is named exactly {@code "Summary"}.</li>
 *   <li>Sheets {@code 1..|T|} are named exactly the {@code client_prefix} values, in the
 *       same order as the summary data rows (alphabetical by tenant name,
 *       case-insensitive).</li>
 * </ul>
 *
 * <p><strong>Validates: Requirements 10.2, 10.7, 10.10</strong>
 *
 * <p>Sprint 24 — S24-T03, task 3.5.
 */
@ExtendWith(MockitoExtension.class)
class MsspAggregateReportServiceWorkbookPropertyTest {

    @Mock private HaClientRepository haClientRepository;
    @Mock private ComplianceResultRepository complianceResultRepository;

    // =========================================================================
    // MethodSource: representative tenant sets
    // =========================================================================

    /**
     * Returns a few representative tenant sets exercising the key boundary cases:
     * empty list, a single tenant, and multiple tenants already sorted by name.
     *
     * <p>The repository contract ({@code findManagedTenantsSortedByName}) guarantees
     * that tenants are returned in ascending case-insensitive name order; the test
     * stubs honour that contract directly so the ordering assertion is deterministic.
     */
    static Stream<List<HaClient>> tenantSets() {
        return Stream.of(
            Collections.emptyList(),
            List.of(makeTenant(1L, "acme", "Acme Corp")),
            List.of(
                makeTenant(1L, "acme", "Acme Corp"),
                makeTenant(2L, "beta", "Beta Inc"),
                makeTenant(3L, "gamma", "Gamma LLC")
            )
        );
    }

    // =========================================================================
    // P4 — Sheet 0 is "Summary" and sheets 1..N match client_prefix order
    // Validates: Requirements 10.2, 10.7, 10.10
    // =========================================================================

    /**
     * <strong>Validates: Requirements 10.2, 10.7, 10.10</strong>
     *
     * <p>For any representative set of managed tenants:
     * <ul>
     *   <li>Total sheet count equals {@code 1 + |T|} (Summary + one per tenant).</li>
     *   <li>Sheet 0 is named {@code "Summary"}.</li>
     *   <li>Sheets {@code 1..|T|} are named by the {@code client_prefix} values in the
     *       same order that {@code findManagedTenantsSortedByName()} returns them.</li>
     * </ul>
     */
    @ParameterizedTest(name = "P4: workbook structure for {0} tenants")
    @MethodSource("tenantSets")
    @DisplayName("P4: sheet 0 is Summary, remaining sheets match client_prefix values in order")
    void p4_workbookSheetCountAndOrdering(List<HaClient> tenants) throws Exception {
        when(haClientRepository.findManagedTenantsSortedByName()).thenReturn(tenants);
        when(complianceResultRepository.rollupForClient(any()))
                .thenReturn(new ComplianceRollup(2, 1));
        when(complianceResultRepository.findByClientIdOrderByEvaluatedAtAsc(any()))
                .thenReturn(Collections.emptyList());

        MsspAggregateReportService service =
                new MsspAggregateReportService(haClientRepository, complianceResultRepository);
        byte[] bytes = service.buildAggregateWorkbook();

        try (XSSFWorkbook workbook = new XSSFWorkbook(new ByteArrayInputStream(bytes))) {
            // Total sheet count: Summary + one per tenant
            assertThat(workbook.getNumberOfSheets())
                    .as("workbook must have 1 + %d sheets", tenants.size())
                    .isEqualTo(1 + tenants.size());

            // Sheet 0 must always be named "Summary"
            assertThat(workbook.getSheetName(0))
                    .as("sheet 0 must be named 'Summary'")
                    .isEqualTo("Summary");

            // Sheets 1..N must match client_prefix values in the repository-returned order
            for (int i = 0; i < tenants.size(); i++) {
                assertThat(workbook.getSheetName(i + 1))
                        .as("sheet %d must be named '%s'", i + 1, tenants.get(i).getClientPrefix())
                        .isEqualTo(tenants.get(i).getClientPrefix());
            }
        }
    }

    // =========================================================================
    // P4 edge case — zero tenants: workbook has exactly one sheet ("Summary")
    // Validates: Requirement 10.10
    // =========================================================================

    /**
     * <strong>Validates: Requirement 10.10</strong>
     *
     * <p>When no managed tenants exist, {@code buildAggregateWorkbook()} produces a
     * workbook with exactly one sheet named {@code "Summary"} and zero per-tenant sheets.
     */
    @Test
    @DisplayName("P4: zero tenants — workbook has exactly 1 sheet named Summary")
    void p4_zeroTenants_onlySummarySheet() throws Exception {
        when(haClientRepository.findManagedTenantsSortedByName())
                .thenReturn(Collections.emptyList());

        MsspAggregateReportService service =
                new MsspAggregateReportService(haClientRepository, complianceResultRepository);
        byte[] bytes = service.buildAggregateWorkbook();

        try (XSSFWorkbook workbook = new XSSFWorkbook(new ByteArrayInputStream(bytes))) {
            assertThat(workbook.getNumberOfSheets())
                    .as("workbook with no tenants must have exactly 1 sheet")
                    .isEqualTo(1);
            assertThat(workbook.getSheetName(0))
                    .as("the only sheet must be named 'Summary'")
                    .isEqualTo("Summary");
        }
    }

    // =========================================================================
    // Factory helper
    // =========================================================================

    private static HaClient makeTenant(Long id, String prefix, String name) {
        HaClient c = new HaClient();
        c.setId(id);
        c.setClientPrefix(prefix);
        c.setName(name);
        c.setMsspManaged(true);
        return c;
    }
}
