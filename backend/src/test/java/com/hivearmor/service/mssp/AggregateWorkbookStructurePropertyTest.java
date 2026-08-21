package com.hivearmor.service.mssp;

import com.hivearmor.domain.HaClient;
import com.hivearmor.repository.HaClientRepository;
import com.hivearmor.repository.compliance.ComplianceResultRepository;
import net.jqwik.api.*;
import net.jqwik.api.lifecycle.BeforeTry;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.Tag;

import java.io.ByteArrayInputStream;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/**
 * Property P4 — Workbook sheet count and ordering are pure functions of {@code ha_client}.
 *
 * <p>For any set of managed tenants {@code T} (generated with jqwik, each with a valid
 * {@code client_prefix}):
 * <ol>
 *   <li>Sheet 0 is named exactly {@code "Summary"}.</li>
 *   <li>Sheets {@code 1..|T|} are named exactly the {@code client_prefix} values, in the
 *       order matching the Summary data rows (ascending case-insensitive tenant name).</li>
 *   <li>When zero managed tenants exist, the workbook contains only one sheet
 *       ({@code "Summary"}) with no per-tenant sheets.</li>
 * </ol>
 *
 * <p><strong>Validates: Requirements 10.2, 10.7, 10.10</strong>
 *
 * <p>Sprint 24 — S24-T03, task 3.5.
 */
@Tag("Feature: sprint-24-per-tenant-compliance")
@Label("Property P4: Workbook sheet count and ordering are pure functions of ha_client")
class AggregateWorkbookStructurePropertyTest {

    private HaClientRepository mockHaClientRepository;
    private ComplianceResultRepository mockComplianceResultRepository;
    private MsspAggregateReportService service;

    @BeforeTry
    void setUp() {
        mockHaClientRepository = mock(HaClientRepository.class);
        mockComplianceResultRepository = mock(ComplianceResultRepository.class);
        service = new MsspAggregateReportService(
                mockHaClientRepository,
                mockComplianceResultRepository);

        // No compliance rows for any tenant — we're only testing structure, not data
        when(mockComplianceResultRepository.findByClientIdOrderByEvaluatedAtAsc(any()))
                .thenReturn(List.of());
    }

    // =========================================================================
    // Arbitraries
    // =========================================================================

    /**
     * Generates a list of 1–10 managed tenants, each with a unique valid
     * {@code client_prefix} in {@code [a-z]{3,10}}.
     */
    @Provide
    Arbitrary<List<HaClient>> managedTenantSets() {
        return Arbitraries.integers().between(1, 10).flatMap(n -> {
            Arbitrary<List<String>> prefixLists = Arbitraries.strings()
                    .withChars("abcdefghijklmnopqrstuvwxyz")
                    .ofMinLength(3).ofMaxLength(10)
                    .list().ofSize(n)
                    .filter(list -> list.stream().distinct().count() == n); // unique prefixes

            return prefixLists.map(prefixes -> {
                List<HaClient> clients = new ArrayList<>();
                for (int i = 0; i < prefixes.size(); i++) {
                    HaClient c = new HaClient();
                    c.setId((long) (i + 1));
                    c.setClientPrefix(prefixes.get(i));
                    // Name is distinct for ordering: "Tenant-<prefix>"
                    c.setName("Tenant-" + prefixes.get(i));
                    c.setMsspManaged(true);
                    clients.add(c);
                }
                return clients;
            });
        });
    }

    // =========================================================================
    // P4a — Sheet 0 is "Summary" and sheets 1..N match the sorted tenant prefixes
    // Validates: Requirements 10.2, 10.7, 10.10
    // =========================================================================

    /**
     * <strong>Validates: Requirements 10.2, 10.7, 10.10</strong>
     *
     * <p>For any non-empty set of managed tenants:
     * <ul>
     *   <li>Sheet count == {@code 1 + |T|} (Summary + one per tenant)</li>
     *   <li>Sheet 0 is named {@code "Summary"}</li>
     *   <li>Sheets 1..|T| are named by the sorted (ascending, case-insensitive name)
     *       tenant {@code client_prefix} values</li>
     * </ul>
     */
    @Property(tries = 200)
    @Label("P4a: workbook has Summary at 0 and one sheet per tenant in sorted name order")
    void property4a_workbookSheetCountAndOrdering(
            @ForAll("managedTenantSets") List<HaClient> tenants) throws Exception {

        when(mockHaClientRepository.findManagedTenantsSortedByName())
                .thenReturn(tenants.stream()
                        .sorted(Comparator.comparing(c -> c.getName().toLowerCase()))
                        .toList());

        byte[] bytes = service.buildAggregateWorkbook();

        try (XSSFWorkbook workbook = new XSSFWorkbook(new ByteArrayInputStream(bytes))) {
            // Sheet count: Summary + one per tenant
            assertThat(workbook.getNumberOfSheets())
                    .as("workbook must have 1 + %d sheets", tenants.size())
                    .isEqualTo(1 + tenants.size());

            // Sheet 0 must be "Summary"
            assertThat(workbook.getSheetAt(0).getSheetName())
                    .as("sheet 0 must be named 'Summary'")
                    .isEqualTo("Summary");

            // Compute expected sheet order: sorted ascending by lowercase name
            List<String> expectedPrefixes = tenants.stream()
                    .sorted(Comparator.comparing(c -> c.getName().toLowerCase()))
                    .map(HaClient::getClientPrefix)
                    .toList();

            for (int i = 0; i < expectedPrefixes.size(); i++) {
                String sheetName = workbook.getSheetAt(i + 1).getSheetName();
                assertThat(sheetName)
                        .as("sheet %d must be named '%s'", i + 1, expectedPrefixes.get(i))
                        .isEqualTo(expectedPrefixes.get(i));
            }
        }
    }

    // =========================================================================
    // P4b — Zero managed tenants: workbook has exactly one sheet ("Summary")
    // Validates: Requirement 10.10
    // =========================================================================

    /**
     * <strong>Validates: Requirement 10.10</strong>
     *
     * <p>When no managed tenants exist, {@code buildAggregateWorkbook()} produces a
     * workbook with exactly one sheet named {@code "Summary"} and zero per-tenant sheets.
     */
    @Property(tries = 1)
    @Label("P4b: zero managed tenants → Summary sheet only, no per-tenant sheets")
    void property4b_emptyTenantSet_summarySheetOnly() throws Exception {
        when(mockHaClientRepository.findManagedTenantsSortedByName())
                .thenReturn(List.of());

        byte[] bytes = service.buildAggregateWorkbook();

        try (XSSFWorkbook workbook = new XSSFWorkbook(new ByteArrayInputStream(bytes))) {
            assertThat(workbook.getNumberOfSheets())
                    .as("workbook with no tenants must have exactly 1 sheet")
                    .isEqualTo(1);
            assertThat(workbook.getSheetAt(0).getSheetName())
                    .as("the only sheet must be named 'Summary'")
                    .isEqualTo("Summary");
        }
    }
}
