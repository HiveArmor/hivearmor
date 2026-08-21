package com.hivearmor.compliance.service;

import net.jqwik.api.*;

import org.apache.poi.ss.usermodel.*;
import org.apache.poi.ss.util.PaneInformation;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Property-based test for HaComplianceReportService CSV round-trip.
 *
 * <p><strong>Validates: Requirements 6.4, 6.5, 6.6</strong>
 *
 * <p>Property 4 (CSV Round-Trip): For any framework state, the CSV bytes emitted by
 * generateRoc(), when re-parsed by an RFC-4180-compliant CSV reader, yield the exact
 * header row and exactly one data row per control with all fields preserved byte-for-byte.
 */
@Label("Feature: sprint-30-compliance-packs, Property 4: CSV Round-Trip")
class HaComplianceReportServicePBT {

    /**
     * Property 4: CSV Round-Trip.
     *
     * <p>For any set of control rows (including fields with commas, quotes, CRs, LFs),
     * generateRoc() output re-parsed by an RFC-4180 parser yields the same header plus
     * one row per control with all fields preserved byte-for-byte.
     *
     * <p><strong>Validates: Property 4 (CSV Round-Trip) — Requirements 6.4, 6.5, 6.6</strong>
     */
    @Property(tries = 150)
    @Tag("Feature: sprint-30-compliance-packs, Property 4: CSV Round-Trip")
    @Label("csvRoundTrip")
    void csvRoundTrip(@ForAll("controlRowLists") List<HaComplianceReportService.ControlRow> controls) {

        // -- Act: generate CSV --
        byte[] csvBytes = new HaComplianceReportService(null, null).generateRoc(controls);

        // -- Parse CSV with an RFC-4180 parser --
        String csvText = new String(csvBytes, StandardCharsets.UTF_8);
        List<String[]> parsedRows = parseRfc4180Csv(csvText);

        // -- Assert: header row matches --
        assertThat(parsedRows).as("CSV must have at least the header row")
            .hasSizeGreaterThanOrEqualTo(1);

        String[] parsedHeader = parsedRows.get(0);
        assertThat(parsedHeader).as("Header must have exactly 7 columns")
            .hasSize(HaComplianceReportService.ROC_HEADERS.length);
        for (int i = 0; i < HaComplianceReportService.ROC_HEADERS.length; i++) {
            assertThat(parsedHeader[i])
                .as("Header column %d must match", i)
                .isEqualTo(HaComplianceReportService.ROC_HEADERS[i]);
        }

        // -- Assert: row count matches (header + one per control) --
        assertThat(parsedRows).as("Total rows = header + data rows")
            .hasSize(controls.size() + 1);

        // -- Assert: every field preserved byte-for-byte --
        for (int r = 0; r < controls.size(); r++) {
            HaComplianceReportService.ControlRow ctrl = controls.get(r);
            String[] parsedRow = parsedRows.get(r + 1);

            assertThat(parsedRow).as("Data row %d must have 7 fields", r)
                .hasSize(7);

            assertThat(parsedRow[0])
                .as("Row %d, field 'Family'", r)
                .isEqualTo(ctrl.family);
            assertThat(parsedRow[1])
                .as("Row %d, field 'Control ID'", r)
                .isEqualTo(ctrl.controlId);
            assertThat(parsedRow[2])
                .as("Row %d, field 'Control Name'", r)
                .isEqualTo(ctrl.controlName);
            assertThat(parsedRow[3])
                .as("Row %d, field 'Status'", r)
                .isEqualTo(ctrl.status);
            assertThat(parsedRow[4])
                .as("Row %d, field 'Owner'", r)
                .isEqualTo(ctrl.owner);
            assertThat(parsedRow[5])
                .as("Row %d, field 'Last Assessed'", r)
                .isEqualTo(ctrl.lastAssessed);
            assertThat(parsedRow[6])
                .as("Row %d, field 'Notes'", r)
                .isEqualTo(ctrl.notes);
        }
    }

    // =========================================================================
    // Property 5: Excel Column Contract
    // =========================================================================

    /**
     * Property 5: Excel Column Contract.
     *
     * <p>For any framework state (list of controls), row 0 of the "Control Matrix" sheet
     * in the XLSX bytes produced by generateNistMatrix() contains exactly the seven string
     * values ["Family", "Control ID", "Control Name", "Status", "Owner", "Last Assessed", "Notes"]
     * at cells 0..6 in that order, cells 7+ in row 0 are unpopulated, and row 0 is frozen.
     *
     * <p><strong>Validates: Property 5 (Excel Column Contract) — Requirements 6.1, 6.2, 6.3</strong>
     */
    @Property(tries = 150)
    @Tag("Feature: sprint-30-compliance-packs, Property 5: Excel Column Contract")
    @Label("excelColumnContract")
    void excelColumnContract(@ForAll("excelControlRowLists") List<HaComplianceReportService.ControlRow> controls) throws Exception {

        // -- Act: generate XLSX --
        byte[] xlsxBytes = new HaComplianceReportService(null, null).generateNistMatrix(controls);

        // -- Parse XLSX with Apache POI --
        try (XSSFWorkbook workbook = new XSSFWorkbook(new ByteArrayInputStream(xlsxBytes))) {
            Sheet matrixSheet = workbook.getSheet("Control Matrix");
            assertThat(matrixSheet).as("Sheet 'Control Matrix' must exist").isNotNull();

            Row headerRow = matrixSheet.getRow(0);
            assertThat(headerRow).as("Row 0 must exist").isNotNull();

            // -- Assert: cells 0..6 match MATRIX_HEADERS exactly --
            for (int i = 0; i < HaComplianceReportService.MATRIX_HEADERS.length; i++) {
                Cell cell = headerRow.getCell(i);
                assertThat(cell)
                    .as("Header cell %d must exist", i)
                    .isNotNull();
                assertThat(cell.getCellType())
                    .as("Header cell %d must be STRING type", i)
                    .isEqualTo(CellType.STRING);
                assertThat(cell.getStringCellValue())
                    .as("Header cell %d must equal MATRIX_HEADERS[%d]", i, i)
                    .isEqualTo(HaComplianceReportService.MATRIX_HEADERS[i]);
            }

            // -- Assert: cells 7+ in row 0 are unpopulated --
            int lastCellNum = headerRow.getLastCellNum();
            // getLastCellNum() returns -1 if no cells, or the index of the last cell + 1
            if (lastCellNum > HaComplianceReportService.MATRIX_HEADERS.length) {
                for (int i = HaComplianceReportService.MATRIX_HEADERS.length; i < lastCellNum; i++) {
                    Cell cell = headerRow.getCell(i);
                    assertThat(cell == null || cell.getCellType() == CellType.BLANK)
                        .as("Cell %d in row 0 must be null or blank, but was: %s", i,
                            cell != null ? cell.toString() : "null")
                        .isTrue();
                }
            }

            // -- Assert: row 0 is frozen (freeze pane at row 1) --
            PaneInformation paneInfo = matrixSheet.getPaneInformation();
            assertThat(paneInfo)
                .as("Sheet must have a freeze pane configured")
                .isNotNull();
            assertThat(paneInfo.isFreezePane())
                .as("Pane must be a freeze pane (not a split pane)")
                .isTrue();
            assertThat(paneInfo.getHorizontalSplitPosition())
                .as("Freeze pane horizontal split must be at row 1 (freezing row 0)")
                .isEqualTo((short) 1);
        }
    }

    /**
     * Generates a list of 0-20 ControlRow objects with varied field values
     * suitable for XLSX generation testing.
     */
    @Provide
    Arbitrary<List<HaComplianceReportService.ControlRow>> excelControlRowLists() {
        Arbitrary<String> statusArb = Arbitraries.of(
            "compliant", "partial", "non-compliant", "not-assessed"
        );

        Arbitrary<String> plainField = Arbitraries.strings()
            .withCharRange('A', 'Z')
            .withCharRange('a', 'z')
            .withCharRange('0', '9')
            .withChars(' ', '-', '_', '.')
            .ofMinLength(1)
            .ofMaxLength(40);

        Arbitrary<HaComplianceReportService.ControlRow> controlRow =
            Combinators.combine(
                plainField,   // family
                plainField,   // controlId
                plainField,   // controlName
                statusArb,    // status
                plainField,   // owner
                plainField,   // lastAssessed
                plainField    // notes
            ).as((family, controlId, controlName, status, owner, lastAssessed, notes) -> {
                HaComplianceReportService.ControlRow row = new HaComplianceReportService.ControlRow();
                row.family = family;
                row.controlId = controlId;
                row.controlName = controlName;
                row.status = status;
                row.owner = owner;
                row.lastAssessed = lastAssessed;
                row.notes = notes;
                return row;
            });

        return controlRow.list().ofMinSize(0).ofMaxSize(20);
    }

    // =========================================================================
    // RFC-4180 CSV Parser (independent re-implementation for verification)
    // =========================================================================

    /**
     * Parses RFC-4180 compliant CSV text into a list of String arrays.
     * Each record is terminated by CRLF. Fields may be quoted with double-quotes;
     * embedded double-quotes are represented as two consecutive double-quotes.
     */
    private static List<String[]> parseRfc4180Csv(String csv) {
        List<String[]> records = new ArrayList<>();
        List<String> currentRecord = new ArrayList<>();
        StringBuilder currentField = new StringBuilder();
        boolean inQuotes = false;
        int i = 0;

        while (i < csv.length()) {
            char c = csv.charAt(i);

            if (inQuotes) {
                if (c == '"') {
                    // Check for escaped quote (doubled)
                    if (i + 1 < csv.length() && csv.charAt(i + 1) == '"') {
                        currentField.append('"');
                        i += 2;
                    } else {
                        // End of quoted field
                        inQuotes = false;
                        i++;
                    }
                } else {
                    currentField.append(c);
                    i++;
                }
            } else {
                if (c == '"' && currentField.length() == 0) {
                    // Start of quoted field
                    inQuotes = true;
                    i++;
                } else if (c == ',') {
                    // Field separator
                    currentRecord.add(currentField.toString());
                    currentField.setLength(0);
                    i++;
                } else if (c == '\r' && i + 1 < csv.length() && csv.charAt(i + 1) == '\n') {
                    // Record terminator (CRLF)
                    currentRecord.add(currentField.toString());
                    currentField.setLength(0);
                    records.add(currentRecord.toArray(new String[0]));
                    currentRecord = new ArrayList<>();
                    i += 2;
                } else if (c == '\r') {
                    // Lone CR — treat as part of field content (unusual, but handle)
                    currentField.append(c);
                    i++;
                } else if (c == '\n') {
                    // Lone LF — treat as record terminator for lenience
                    currentRecord.add(currentField.toString());
                    currentField.setLength(0);
                    records.add(currentRecord.toArray(new String[0]));
                    currentRecord = new ArrayList<>();
                    i++;
                } else {
                    currentField.append(c);
                    i++;
                }
            }
        }

        // Handle any remaining content (no trailing CRLF)
        if (currentField.length() > 0 || !currentRecord.isEmpty()) {
            currentRecord.add(currentField.toString());
            records.add(currentRecord.toArray(new String[0]));
        }

        return records;
    }

    // =========================================================================
    // Generators
    // =========================================================================

    /**
     * Generates a list of 0-20 ControlRow objects with varied field values
     * including special CSV characters (commas, quotes, newlines, CRs).
     */
    @Provide
    Arbitrary<List<HaComplianceReportService.ControlRow>> controlRowLists() {
        Arbitrary<HaComplianceReportService.ControlRow> controlRow =
            Combinators.combine(
                csvFieldArbitrary(), // family
                csvFieldArbitrary(), // controlId
                csvFieldArbitrary(), // controlName
                csvFieldArbitrary(), // status
                csvFieldArbitrary(), // owner
                csvFieldArbitrary(), // lastAssessed
                csvFieldArbitrary()  // notes
            ).as((family, controlId, controlName, status, owner, lastAssessed, notes) -> {
                HaComplianceReportService.ControlRow row = new HaComplianceReportService.ControlRow();
                row.family = family;
                row.controlId = controlId;
                row.controlName = controlName;
                row.status = status;
                row.owner = owner;
                row.lastAssessed = lastAssessed;
                row.notes = notes;
                return row;
            });

        return controlRow.list().ofMinSize(0).ofMaxSize(20);
    }

    /**
     * Generates CSV field values that exercise RFC-4180 escaping:
     * - Plain alphanumeric strings
     * - Strings with embedded commas
     * - Strings with embedded double-quotes
     * - Strings with embedded newlines (LF)
     * - Strings with embedded carriage returns (CR)
     * - Strings with embedded CRLF sequences
     * - Empty strings
     * - Mixed content combining multiple special characters
     */
    private Arbitrary<String> csvFieldArbitrary() {
        return Arbitraries.oneOf(
            // Empty string
            Arbitraries.just(""),
            // Plain alphanumeric (no special chars)
            Arbitraries.strings()
                .withCharRange('A', 'Z')
                .withCharRange('a', 'z')
                .withCharRange('0', '9')
                .withChars(' ', '-', '_', '.')
                .ofMinLength(1)
                .ofMaxLength(50),
            // String with embedded comma
            Arbitraries.strings()
                .withCharRange('A', 'Z')
                .withCharRange('a', 'z')
                .withChars(',')
                .ofMinLength(2)
                .ofMaxLength(30),
            // String with embedded double-quote
            Arbitraries.strings()
                .withCharRange('a', 'z')
                .withChars('"')
                .ofMinLength(2)
                .ofMaxLength(30),
            // String with embedded newline
            Arbitraries.strings()
                .withCharRange('a', 'z')
                .withChars('\n')
                .ofMinLength(2)
                .ofMaxLength(30),
            // String with embedded carriage return
            Arbitraries.strings()
                .withCharRange('a', 'z')
                .withChars('\r')
                .ofMinLength(2)
                .ofMaxLength(20),
            // String with embedded CRLF
            Combinators.combine(
                Arbitraries.strings().withCharRange('a', 'z').ofMinLength(1).ofMaxLength(10),
                Arbitraries.strings().withCharRange('a', 'z').ofMinLength(1).ofMaxLength(10)
            ).as((before, after) -> before + "\r\n" + after),
            // Mixed: comma + quote + newline
            Combinators.combine(
                Arbitraries.strings().withCharRange('a', 'z').ofMinLength(1).ofMaxLength(8),
                Arbitraries.strings().withCharRange('a', 'z').ofMinLength(1).ofMaxLength(8)
            ).as((a, b) -> a + ",\"" + b + "\n")
        );
    }
}
