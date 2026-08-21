package com.hivearmor.service.mssp;

import com.hivearmor.domain.HaClient;
import com.hivearmor.domain.compliance.ComplianceResult;
import com.hivearmor.multitenancy.TenantContext;
import com.hivearmor.repository.HaClientRepository;
import com.hivearmor.repository.compliance.ComplianceResultRepository;
import com.hivearmor.repository.compliance.ComplianceRollup;
import org.apache.poi.xssf.usermodel.XSSFRow;
import org.apache.poi.xssf.usermodel.XSSFSheet;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.stereotype.Service;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.List;

/**
 * Builds the MSSP aggregate XLSX workbook.
 *
 * <p>Produces a workbook with:
 * <ul>
 *   <li>Sheet 0 — {@code Summary}: one row per managed tenant with aggregate
 *       pass/fail counts and a compliance score percentage.</li>
 *   <li>Sheets 1..N — one sheet per managed tenant (name = {@code clientPrefix})
 *       listing every {@link ComplianceResult} sorted ascending by
 *       {@code evaluatedAt}.</li>
 * </ul>
 *
 * <p>Tenants are fetched in a single JDBC call sorted ascending by
 * {@code LOWER(name)} via
 * {@link HaClientRepository#findManagedTenantsSortedByName()}.
 *
 * <p>Rollup aggregation is delegated to
 * {@link ComplianceResultRepository#rollupForClient(Long)} — a server-side
 * JPQL {@code SUM} projection — so no full result-set is loaded into memory
 * for the Summary sheet.
 *
 * <p>Every repository call that operates under a tenant scope sets
 * {@link TenantContext} and clears it inside a {@code finally} block as
 * required by the per-tenant compliance layer contract (Requirement 2.4).
 *
 * <p>Sprint 24 — S24-T02 task 3.2.
 *
 * @see MsspAggregateReportController
 */
@Service
public class MsspAggregateReportService {

    private static final String SUMMARY_SHEET_NAME = "Summary";
    private static final List<String> SUMMARY_HEADERS = List.of(
        "Tenant Name", "Client Prefix",
        "Controls Passed", "Controls Failed", "Controls Total", "Compliance Score");
    private static final List<String> PER_TENANT_HEADERS = List.of(
        "Control ID", "Control Name", "Framework", "Status", "Evaluated At");

    private final HaClientRepository haClientRepository;
    private final ComplianceResultRepository complianceResultRepository;

    public MsspAggregateReportService(
            HaClientRepository haClientRepository,
            ComplianceResultRepository complianceResultRepository) {
        this.haClientRepository = haClientRepository;
        this.complianceResultRepository = complianceResultRepository;
    }

    /**
     * Builds and returns the aggregate XLSX workbook as a byte array.
     *
     * @return raw XLSX bytes; never {@code null}
     * @throws AggregateReportBuildException if POI serialisation fails
     */
    public byte[] buildAggregateWorkbook() {
        List<HaClient> tenants = haClientRepository.findManagedTenantsSortedByName();
        try (XSSFWorkbook workbook = new XSSFWorkbook();
             ByteArrayOutputStream bos = new ByteArrayOutputStream()) {
            writeSummarySheet(workbook, tenants);
            for (HaClient tenant : tenants) {
                writePerTenantSheet(workbook, tenant);
            }
            workbook.write(bos);
            return bos.toByteArray();
        } catch (IOException e) {
            throw new AggregateReportBuildException("Failed to build aggregate workbook", e);
        }
    }

    // -------------------------------------------------------------------------
    // Private helpers
    // -------------------------------------------------------------------------

    private void writeSummarySheet(XSSFWorkbook workbook, List<HaClient> tenants) {
        XSSFSheet sheet = workbook.createSheet(SUMMARY_SHEET_NAME);
        writeHeaderRow(sheet, SUMMARY_HEADERS);
        int rowIdx = 1;
        for (HaClient tenant : tenants) {
            ComplianceRollup rollup = readRollupForTenant(tenant);
            XSSFRow row = sheet.createRow(rowIdx++);
            row.createCell(0).setCellValue(tenant.getName() != null ? tenant.getName() : "");
            row.createCell(1).setCellValue(tenant.getClientPrefix() != null ? tenant.getClientPrefix() : "");
            row.createCell(2).setCellValue(rollup.passed());
            row.createCell(3).setCellValue(rollup.failed());
            row.createCell(4).setCellValue(rollup.total());
            row.createCell(5).setCellValue(computeScore(rollup));
        }
    }

    private void writePerTenantSheet(XSSFWorkbook workbook, HaClient tenant) {
        XSSFSheet sheet = workbook.createSheet(tenant.getClientPrefix());
        writeHeaderRow(sheet, PER_TENANT_HEADERS);
        List<ComplianceResult> results = readResultsForTenantSortedByEvaluatedAt(tenant);
        int rowIdx = 1;
        for (ComplianceResult r : results) {
            XSSFRow row = sheet.createRow(rowIdx++);
            row.createCell(0).setCellValue(r.getControlId() != null ? r.getControlId() : 0L);
            row.createCell(1).setCellValue(r.getControlName() != null ? r.getControlName() : "");
            row.createCell(2).setCellValue(r.getFramework() != null ? r.getFramework() : "");
            row.createCell(3).setCellValue(r.getStatus() != null ? r.getStatus() : "");
            row.createCell(4).setCellValue(r.getEvaluatedAt() != null ? r.getEvaluatedAt().toString() : "");
        }
    }

    /**
     * Fetches the aggregate pass/fail rollup for {@code tenant} by temporarily
     * establishing a {@link TenantContext} scope.
     *
     * <p>A {@code null} result from the repository (no rows for this tenant) is
     * normalised to a zero-count {@link ComplianceRollup}.
     */
    private ComplianceRollup readRollupForTenant(HaClient tenant) {
        TenantContext.set(tenant.getId(), tenant.getClientPrefix());
        try {
            ComplianceRollup rollup = complianceResultRepository.rollupForClient(tenant.getId());
            return rollup != null ? rollup : new ComplianceRollup(0, 0);
        } finally {
            TenantContext.clear();
        }
    }

    /**
     * Fetches all compliance results for {@code tenant}, sorted ascending by
     * {@code evaluatedAt}, by temporarily establishing a {@link TenantContext} scope.
     */
    private List<ComplianceResult> readResultsForTenantSortedByEvaluatedAt(HaClient tenant) {
        TenantContext.set(tenant.getId(), tenant.getClientPrefix());
        try {
            return complianceResultRepository.findByClientIdOrderByEvaluatedAtAsc(tenant.getId());
        } finally {
            TenantContext.clear();
        }
    }

    /**
     * Returns the compliance score as a whole-number percentage.
     * Returns {@code 0} when {@code rollup.total()} is zero to avoid division by zero.
     */
    private int computeScore(ComplianceRollup rollup) {
        return rollup.total() > 0
            ? (int) Math.round(100.0 * rollup.passed() / rollup.total())
            : 0;
    }

    private void writeHeaderRow(XSSFSheet sheet, List<String> headers) {
        XSSFRow header = sheet.createRow(0);
        for (int i = 0; i < headers.size(); i++) {
            header.createCell(i).setCellValue(headers.get(i));
        }
    }
}
