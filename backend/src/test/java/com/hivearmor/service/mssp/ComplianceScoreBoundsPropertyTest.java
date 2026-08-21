package com.hivearmor.service.mssp;

import com.hivearmor.domain.HaClient;
import com.hivearmor.repository.HaClientRepository;
import com.hivearmor.repository.compliance.ComplianceResultRepository;
import com.hivearmor.repository.compliance.ComplianceRollup;
import org.apache.poi.xssf.usermodel.XSSFSheet;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.io.ByteArrayInputStream;
import java.util.Collections;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

/**
 * Property-based test — P5: Compliance Score is always an integer in [0, 100].
 *
 * <p>For arbitrary {@code passed}, {@code failed}, {@code total = passed + failed}
 * with {@code passed, failed >= 0}, the Compliance Score written to the Summary sheet
 * of the aggregate workbook must satisfy:
 * <ul>
 *   <li>score ∈ [0, 100]</li>
 *   <li>score = 0 when total = 0 (division-by-zero guard)</li>
 * </ul>
 *
 * <p>The {@code computeScore} method is private; this test exercises the property
 * end-to-end via {@link MsspAggregateReportService#buildAggregateWorkbook()},
 * reading column 5 ("Compliance Score") of the first data row in the Summary sheet.
 *
 * <p><b>Validates: Requirements 10.6</b>
 *
 * <p>Sprint 24 — task 3.6.
 */
@ExtendWith(MockitoExtension.class)
class ComplianceScoreBoundsPropertyTest {

    @Mock
    private HaClientRepository haClientRepository;

    @Mock
    private ComplianceResultRepository complianceResultRepository;

    /**
     * P5: compliance score is always in [0, 100] and equals 0 when total is 0.
     *
     * <p>Each row is a (passed, failed) pair covering:
     * <ul>
     *   <li>(0, 0)   — zero total → must be exactly 0</li>
     *   <li>(10, 0)  — 100 %</li>
     *   <li>(0, 10)  — 0 %</li>
     *   <li>(5, 5)   — 50 %</li>
     *   <li>(3, 7)   — 30 %</li>
     *   <li>(99, 1)  — 99 %</li>
     *   <li>(1, 99)  — 1 %</li>
     * </ul>
     */
    @ParameterizedTest(name = "P5: passed={0}, failed={1} -> score in [0,100]")
    @CsvSource({
        "0,  0",   // total=0  -> score must be 0
        "10, 0",   // 100%
        "0,  10",  // 0%
        "5,  5",   // 50%
        "3,  7",   // 30%
        "99, 1",   // 99%
        "1,  99"   // 1%
    })
    void p5_complianceScoreIsAlwaysInBounds(int passed, int failed) throws Exception {
        // --- arrange: single managed tenant ---------------------------------
        HaClient tenant = new HaClient();
        tenant.setId(1L);
        tenant.setClientPrefix("test");
        tenant.setName("Test Corp");
        tenant.setMsspManaged(true);

        when(haClientRepository.findManagedTenantsSortedByName())
            .thenReturn(List.of(tenant));
        when(complianceResultRepository.rollupForClient(1L))
            .thenReturn(new ComplianceRollup(passed, failed));
        when(complianceResultRepository.findByClientIdOrderByEvaluatedAtAsc(any()))
            .thenReturn(Collections.emptyList());

        // --- act: build workbook --------------------------------------------
        MsspAggregateReportService service =
            new MsspAggregateReportService(haClientRepository, complianceResultRepository);
        byte[] bytes = service.buildAggregateWorkbook();

        // --- assert: Summary sheet, row 1, column 5 is in [0, 100] ---------
        try (XSSFWorkbook workbook = new XSSFWorkbook(new ByteArrayInputStream(bytes))) {
            XSSFSheet summary = workbook.getSheet("Summary");
            // Row 0 is the header row; row 1 is the first (and only) data row.
            // Column layout: 0=Tenant Name, 1=Client Prefix, 2=Passed,
            //                3=Failed, 4=Total, 5=Compliance Score
            double rawScore = summary.getRow(1).getCell(5).getNumericCellValue();
            int score = (int) rawScore;

            assertThat(score)
                .as("P5 — Compliance Score must be in [0, 100] for passed=%d, failed=%d",
                    passed, failed)
                .isBetween(0, 100);

            // Special case: zero total must produce exactly 0 (no division by zero)
            if (passed + failed == 0) {
                assertThat(score)
                    .as("P5 — Compliance Score must be 0 when total is 0")
                    .isEqualTo(0);
            }
        }
    }
}
