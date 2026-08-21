package com.hivearmor.compliance.service;

import com.hivearmor.domain.compliance.UtmComplianceControlConfig;
import com.hivearmor.domain.compliance.UtmComplianceStandardSection;
import com.hivearmor.repository.compliance.UtmComplianceControlConfigRepository;
import com.hivearmor.repository.compliance.UtmComplianceStandardSectionRepository;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.*;

/**
 * Produces the NIST control-matrix XLSX and PCI-DSS Report on Compliance (RoC) CSV.
 *
 * <p>The CSV output is RFC-4180 compliant: any field containing a comma, double-quote,
 * carriage return, or newline is wrapped in double-quotes with embedded double-quotes doubled.
 *
 * <p>The XLSX output contains two sheets: "Control Matrix" (frozen header row, color-coded
 * status cells, auto-sized columns) and "Summary" (per-family aggregates + overall percentage).
 */
@Service
public class HaComplianceReportService {

    private static final Logger log = LoggerFactory.getLogger(HaComplianceReportService.class);

    public static final String[] MATRIX_HEADERS = {
        "Family", "Control ID", "Control Name", "Status", "Owner", "Last Assessed", "Notes"
    };

    /**
     * CSV header columns for the RoC report.
     */
    public static final String[] ROC_HEADERS = {
        "Family", "Control ID", "Control Name", "Status", "Owner", "Last Assessed", "Notes"
    };

    private final UtmComplianceControlConfigRepository controlRepo;
    private final UtmComplianceStandardSectionRepository sectionRepo;

    private byte[] cachedNistMatrix;
    private byte[] cachedRoc;

    public HaComplianceReportService(
            UtmComplianceControlConfigRepository controlRepo,
            UtmComplianceStandardSectionRepository sectionRepo) {
        this.controlRepo = controlRepo;
        this.sectionRepo = sectionRepo;
    }

    /**
     * Generates the NIST Control Matrix as an XLSX workbook.
     *
     * @return byte array containing the XLSX content
     */
    public byte[] generateNistMatrix() {
        return generateNistMatrix(loadControlRows());
    }

    /**
     * Generates the NIST Control Matrix from the provided control rows.
     * Package-private for testability.
     */
    byte[] generateNistMatrix(List<ControlRow> controls) {
        try (XSSFWorkbook workbook = new XSSFWorkbook()) {
            Sheet matrixSheet = workbook.createSheet("Control Matrix");
            Sheet summarySheet = workbook.createSheet("Summary");

            // Header row — frozen
            Row headerRow = matrixSheet.createRow(0);
            for (int i = 0; i < MATRIX_HEADERS.length; i++) {
                Cell cell = headerRow.createCell(i);
                cell.setCellValue(MATRIX_HEADERS[i]);
            }
            matrixSheet.createFreezePane(0, 1);

            // Create status cell styles
            Map<String, CellStyle> statusStyles = createStatusStyles(workbook);

            // Data rows
            Map<String, int[]> familyAggregates = new LinkedHashMap<>();
            int rowIdx = 1;
            for (ControlRow ctrl : controls) {
                Row row = matrixSheet.createRow(rowIdx++);
                row.createCell(0).setCellValue(ctrl.family);
                row.createCell(1).setCellValue(ctrl.controlId);
                row.createCell(2).setCellValue(ctrl.controlName);

                Cell statusCell = row.createCell(3);
                statusCell.setCellValue(ctrl.status);
                CellStyle style = statusStyles.get(ctrl.status.toLowerCase(Locale.ROOT));
                if (style != null) {
                    statusCell.setCellStyle(style);
                }

                row.createCell(4).setCellValue(ctrl.owner);
                row.createCell(5).setCellValue(ctrl.lastAssessed);
                row.createCell(6).setCellValue(ctrl.notes);

                // Aggregate per family
                familyAggregates.computeIfAbsent(ctrl.family, k -> new int[4]);
                int[] counts = familyAggregates.get(ctrl.family);
                switch (ctrl.status.toLowerCase(Locale.ROOT)) {
                    case "compliant" -> counts[0]++;
                    case "partial" -> counts[1]++;
                    case "non-compliant" -> counts[2]++;
                    default -> counts[3]++;
                }
            }

            // Keep report generation deterministic and safe in headless containers.
            // POI's autoSizeColumn path invokes host font rendering, which is expensive
            // for large exports and can abort native JVMs when fonts are unavailable.
            int[] matrixColumnWidths = { 18, 16, 42, 18, 24, 20, 56 };
            for (int i = 0; i < MATRIX_HEADERS.length; i++) {
                matrixSheet.setColumnWidth(i, matrixColumnWidths[i] * 256);
            }

            // Summary sheet
            Row summaryHeader = summarySheet.createRow(0);
            summaryHeader.createCell(0).setCellValue("Family");
            summaryHeader.createCell(1).setCellValue("Total");
            summaryHeader.createCell(2).setCellValue("Compliant");
            summaryHeader.createCell(3).setCellValue("Partial");
            summaryHeader.createCell(4).setCellValue("NonCompliant");
            summaryHeader.createCell(5).setCellValue("NotAssessed");

            int summaryRow = 1;
            int totalAll = 0, compliantAll = 0;
            for (Map.Entry<String, int[]> entry : familyAggregates.entrySet()) {
                Row row = summarySheet.createRow(summaryRow++);
                int[] counts = entry.getValue();
                int total = counts[0] + counts[1] + counts[2] + counts[3];
                row.createCell(0).setCellValue(entry.getKey());
                row.createCell(1).setCellValue(total);
                row.createCell(2).setCellValue(counts[0]);
                row.createCell(3).setCellValue(counts[1]);
                row.createCell(4).setCellValue(counts[2]);
                row.createCell(5).setCellValue(counts[3]);
                totalAll += total;
                compliantAll += counts[0];
            }

            // Overall percentage row
            Row overallRow = summarySheet.createRow(summaryRow);
            overallRow.createCell(0).setCellValue("Overall");
            overallRow.createCell(1).setCellValue(totalAll);
            double pct = totalAll > 0 ? (double) compliantAll / totalAll * 100.0 : 0.0;
            overallRow.createCell(2).setCellValue(String.format("%.1f%%", pct));

            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            workbook.write(baos);
            return baos.toByteArray();
        } catch (IOException e) {
            throw new RuntimeException("Failed to generate NIST matrix XLSX", e);
        }
    }

    /**
     * Generates the PCI-DSS Report on Compliance as RFC-4180 compliant CSV.
     *
     * @return byte array containing the UTF-8 CSV content
     */
    public byte[] generateRoc() {
        return generateRoc(loadControlRows());
    }

    /**
     * Generates the RoC CSV from the provided control rows.
     * Package-private for testability.
     */
    byte[] generateRoc(List<ControlRow> controls) {
        StringBuilder sb = new StringBuilder();

        // Header row
        sb.append(formatCsvRow(ROC_HEADERS));

        // Data rows
        for (ControlRow ctrl : controls) {
            String[] fields = {
                ctrl.family,
                ctrl.controlId,
                ctrl.controlName,
                ctrl.status,
                ctrl.owner,
                ctrl.lastAssessed,
                ctrl.notes
            };
            sb.append(formatCsvRow(fields));
        }

        return sb.toString().getBytes(StandardCharsets.UTF_8);
    }

    /**
     * Formats a single CSV row per RFC 4180.
     * Fields containing comma, double-quote, CR, or LF are enclosed in double-quotes,
     * with internal double-quotes doubled.
     */
    static String formatCsvRow(String[] fields) {
        StringBuilder row = new StringBuilder();
        for (int i = 0; i < fields.length; i++) {
            if (i > 0) {
                row.append(',');
            }
            row.append(escapeCsvField(fields[i]));
        }
        row.append("\r\n");
        return row.toString();
    }

    /**
     * Escapes a single CSV field per RFC 4180.
     * If the field contains a comma, double-quote, carriage return, or newline,
     * it is wrapped in double-quotes with embedded double-quotes doubled.
     */
    static String escapeCsvField(String field) {
        if (field == null) {
            return "";
        }
        boolean needsQuoting = field.indexOf(',') >= 0
            || field.indexOf('"') >= 0
            || field.indexOf('\r') >= 0
            || field.indexOf('\n') >= 0;

        if (!needsQuoting) {
            return field;
        }

        StringBuilder sb = new StringBuilder(field.length() + 4);
        sb.append('"');
        for (int i = 0; i < field.length(); i++) {
            char c = field.charAt(i);
            if (c == '"') {
                sb.append('"');
            }
            sb.append(c);
        }
        sb.append('"');
        return sb.toString();
    }

    @Scheduled(cron = "0 0 1 1 * ?")
    void regenerateMonthly() {
        log.info("Regenerating compliance reports (monthly schedule)");
        try {
            this.cachedNistMatrix = generateNistMatrix();
            this.cachedRoc = generateRoc();
        } catch (Exception e) {
            log.error("Failed to regenerate compliance reports: {}", e.getMessage(), e);
        }
    }

    // =========================================================================
    // Internal helpers
    // =========================================================================

    private List<ControlRow> loadControlRows() {
        List<ControlRow> rows = new ArrayList<>();
        List<UtmComplianceStandardSection> sections = sectionRepo.findAll();
        for (UtmComplianceStandardSection section : sections) {
            List<UtmComplianceControlConfig> controls = controlRepo.findAll(
                UtmComplianceControlConfigRepository.bySection(section.getId()));
            for (UtmComplianceControlConfig ctrl : controls) {
                ControlRow row = new ControlRow();
                row.family = section.getStandardSectionName() != null
                    ? section.getStandardSectionName() : "";
                row.controlId = ctrl.getId() != null ? ctrl.getId().toString() : "";
                row.controlName = ctrl.getControlName() != null ? ctrl.getControlName() : "";
                row.status = "not-assessed";
                row.owner = "";
                row.lastAssessed = "";
                row.notes = "";
                rows.add(row);
            }
        }
        return rows;
    }

    private Map<String, CellStyle> createStatusStyles(Workbook workbook) {
        Map<String, CellStyle> styles = new HashMap<>();

        CellStyle greenStyle = workbook.createCellStyle();
        greenStyle.setFillForegroundColor(IndexedColors.GREEN.getIndex());
        greenStyle.setFillPattern(FillPatternType.SOLID_FOREGROUND);
        styles.put("compliant", greenStyle);

        CellStyle amberStyle = workbook.createCellStyle();
        amberStyle.setFillForegroundColor(IndexedColors.GOLD.getIndex());
        amberStyle.setFillPattern(FillPatternType.SOLID_FOREGROUND);
        styles.put("partial", amberStyle);

        CellStyle redStyle = workbook.createCellStyle();
        redStyle.setFillForegroundColor(IndexedColors.RED.getIndex());
        redStyle.setFillPattern(FillPatternType.SOLID_FOREGROUND);
        styles.put("non-compliant", redStyle);

        CellStyle grayStyle = workbook.createCellStyle();
        grayStyle.setFillForegroundColor(IndexedColors.GREY_25_PERCENT.getIndex());
        grayStyle.setFillPattern(FillPatternType.SOLID_FOREGROUND);
        styles.put("not-assessed", grayStyle);

        return styles;
    }

    /**
     * Internal representation of a control row for report generation.
     * Package-private for testability from the PBT.
     */
    static class ControlRow {
        String family;
        String controlId;
        String controlName;
        String status;
        String owner;
        String lastAssessed;
        String notes;

        ControlRow() {}

        ControlRow(String family, String controlId, String controlName,
                   String status, String owner, String lastAssessed, String notes) {
            this.family = family;
            this.controlId = controlId;
            this.controlName = controlName;
            this.status = status;
            this.owner = owner;
            this.lastAssessed = lastAssessed;
            this.notes = notes;
        }
    }
}
