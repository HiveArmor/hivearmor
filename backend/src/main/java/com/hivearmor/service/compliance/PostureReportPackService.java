package com.hivearmor.service.compliance;

import com.itextpdf.io.font.constants.StandardFonts;
import com.itextpdf.kernel.colors.DeviceRgb;
import com.itextpdf.kernel.font.PdfFontFactory;
import com.itextpdf.kernel.pdf.PdfDocument;
import com.itextpdf.kernel.pdf.PdfWriter;
import com.itextpdf.layout.Document;
import com.itextpdf.layout.element.Cell;
import com.itextpdf.layout.element.Paragraph;
import com.itextpdf.layout.element.Table;
import com.itextpdf.layout.properties.UnitValue;
import com.hivearmor.service.dto.posture.FleetCisPostureDTO;
import com.hivearmor.service.dto.posture.FleetPostureOverviewDTO;
import com.hivearmor.service.dto.vuln.VulnSummaryDTO;
import com.hivearmor.service.telemetry.HaPostureReportService;
import org.springframework.stereotype.Service;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;

/**
 * Generates cross-fleet posture "report packs" (SPEC-PT-6 §2) — a CIS-benchmark
 * compliance summary + a vulnerability-exposure report — exported as PDF or CSV.
 *
 * <p>Unlike the legacy framework export, every value here is a REAL aggregate from
 * {@link HaPostureReportService} (CIS from {@code v3-hive-cis-*}, vuln from
 * {@code ha_vuln_finding}, coverage from the agent registry). Tenant scoping is
 * enforced inside that service (fail-closed for an unresolved MSSP scope).
 *
 * <p>Honesty contract (SPEC-PT-6 §3): a fleet with no scans exports a "not covered"
 * pack with a null/"not scanned" score — never a fabricated 100%. CSV is RFC-4180.
 * Constructor injection; no Lombok.
 */
@Service
public class PostureReportPackService {

    private static final DateTimeFormatter FMT =
            DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm").withZone(ZoneOffset.UTC);

    private final HaPostureReportService postureReportService;

    public PostureReportPackService(HaPostureReportService postureReportService) {
        this.postureReportService = postureReportService;
    }

    // --- CSV ----------------------------------------------------------------

    /** CIS benchmark compliance summary as RFC-4180 CSV: fleet rollup + per-host grid. */
    public byte[] cisCsv() {
        FleetCisPostureDTO cis = postureReportService.fleetCis();
        StringBuilder sb = new StringBuilder();

        sb.append(row("section", "metric", "value"));
        sb.append(row("fleet", "hosts_total", str(cis.getFleetHostCount())));
        sb.append(row("fleet", "hosts_scanned", str(cis.getHostsScanned())));
        sb.append(row("fleet", "hosts_not_scanned", str(cis.getHostsNotScanned())));
        sb.append(row("fleet", "controls_pass", str(cis.getPassCount())));
        sb.append(row("fleet", "controls_fail", str(cis.getFailCount())));
        sb.append(row("fleet", "controls_error", str(cis.getErrorCount())));
        sb.append(row("fleet", "controls_not_applicable", str(cis.getNaCount())));
        sb.append(row("fleet", "controls_not_checked", str(cis.getNotCheckedCount())));
        sb.append(row("fleet", "fleet_score_pct",
                cis.getFleetScorePct() == null ? "not scanned" : str(cis.getFleetScorePct())));
        sb.append(row("fleet", "last_scanned_at", nvl(cis.getLastScannedAt())));

        sb.append("\r\n");
        sb.append(row("agent_id", "hostname", "platform", "scanned", "pass", "fail",
                "error", "not_applicable", "not_checked", "score_pct", "profile", "scanned_at"));
        for (FleetCisPostureDTO.HostCisPosture h : cis.getHosts()) {
            sb.append(row(
                    nvl(h.getAgentId()),
                    nvl(h.getHostname()),
                    nvl(h.getPlatform()),
                    h.isScanned() ? "yes" : "not covered",
                    h.isScanned() ? str(h.getPassCount()) : "",
                    h.isScanned() ? str(h.getFailCount()) : "",
                    h.isScanned() ? str(h.getErrorCount()) : "",
                    h.isScanned() ? str(h.getNaCount()) : "",
                    h.isScanned() ? str(h.getNotCheckedCount()) : "",
                    h.isScanned() && h.getScorePct() != null ? str(h.getScorePct()) : "",
                    nvl(h.getProfile()),
                    nvl(h.getScannedAt())));
        }
        return sb.toString().getBytes(StandardCharsets.UTF_8);
    }

    /** Vulnerability-exposure report as RFC-4180 CSV: severity rollup + top CVEs. */
    public byte[] vulnCsv() {
        FleetPostureOverviewDTO overview = postureReportService.overview();
        VulnSummaryDTO vuln = overview.getVuln();
        StringBuilder sb = new StringBuilder();

        sb.append(row("section", "metric", "value"));
        sb.append(row("severity", "critical", str(vuln.getCritical())));
        sb.append(row("severity", "high", str(vuln.getHigh())));
        sb.append(row("severity", "medium", str(vuln.getMedium())));
        sb.append(row("severity", "low", str(vuln.getLow())));
        sb.append(row("severity", "info", str(vuln.getInfo())));
        sb.append(row("exposure", "kev_count", str(vuln.getKevCount())));
        sb.append(row("exposure", "affected_hosts", str(vuln.getAffectedAgents())));
        sb.append(row("coverage", "fleet_hosts", str(overview.getCoverage().getFleetHostCount())));
        sb.append(row("coverage", "hosts_with_vuln_data", str(overview.getCoverage().getHostsWithVuln())));
        sb.append(row("coverage", "hosts_uncovered", str(overview.getCoverage().getHostsUncovered())));

        sb.append("\r\n");
        sb.append(row("cve_id", "cvss_v3", "severity", "kev", "affected_hosts"));
        if (vuln.getTopCves() != null) {
            for (VulnSummaryDTO.TopCveDTO cve : vuln.getTopCves()) {
                sb.append(row(
                        nvl(cve.getCveId()),
                        str(cve.getCvssV3()),
                        nvl(cve.getSeverity()),
                        cve.isKev() ? "yes" : "no",
                        str(cve.getAffectedAgents())));
            }
        }
        return sb.toString().getBytes(StandardCharsets.UTF_8);
    }

    // --- PDF ----------------------------------------------------------------

    /** Combined posture report pack (CIS summary + vuln exposure) as a branded PDF. */
    public byte[] overviewPdf() {
        FleetPostureOverviewDTO overview = postureReportService.overview();
        FleetCisPostureDTO cis = overview.getCis();
        VulnSummaryDTO vuln = overview.getVuln();
        try {
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            PdfDocument pdfDoc = new PdfDocument(new PdfWriter(baos));
            Document document = new Document(pdfDoc);

            DeviceRgb brandGreen = new DeviceRgb(0, 196, 64);
            DeviceRgb lightText = new DeviceRgb(120, 130, 140);

            document.add(new Paragraph("HiveArmor — Fleet Posture Report")
                    .setFont(PdfFontFactory.createFont(StandardFonts.HELVETICA_BOLD))
                    .setFontSize(20).setFontColor(brandGreen));
            document.add(new Paragraph("Generated: " + FMT.format(Instant.now()) + " UTC")
                    .setFont(PdfFontFactory.createFont(StandardFonts.HELVETICA))
                    .setFontSize(10).setFontColor(lightText));
            document.add(new Paragraph("\n"));

            // Coverage honesty block
            FleetPostureOverviewDTO.Coverage cov = overview.getCoverage();
            document.add(new Paragraph("Scan Coverage")
                    .setFont(PdfFontFactory.createFont(StandardFonts.HELVETICA_BOLD)).setFontSize(13));
            document.add(new Paragraph(
                    cov.getFleetHostCount() + " hosts in fleet · "
                            + cov.getHostsWithCis() + " with CIS data · "
                            + cov.getHostsWithVuln() + " with vulnerability data · "
                            + cov.getHostsUncovered() + " with no posture data")
                    .setFontSize(10));
            document.add(new Paragraph(
                    "Hosts with no scan are reported as not covered, never counted as compliant.")
                    .setFont(PdfFontFactory.createFont(StandardFonts.HELVETICA_OBLIQUE))
                    .setFontSize(9).setFontColor(lightText));
            document.add(new Paragraph("\n"));

            // CIS summary table
            document.add(new Paragraph("CIS Benchmark Summary")
                    .setFont(PdfFontFactory.createFont(StandardFonts.HELVETICA_BOLD)).setFontSize(13));
            Table cisTable = new Table(UnitValue.createPercentArray(new float[]{3, 2})).useAllAvailableWidth();
            addKv(cisTable, "Fleet pass rate",
                    cis.getFleetScorePct() == null ? "Not scanned" : cis.getFleetScorePct() + "%");
            addKv(cisTable, "Controls passed", str(cis.getPassCount()));
            addKv(cisTable, "Controls failed", str(cis.getFailCount()));
            addKv(cisTable, "Controls errored", str(cis.getErrorCount()));
            addKv(cisTable, "Hosts scanned", cis.getHostsScanned() + " of " + cis.getFleetHostCount());
            addKv(cisTable, "Last scanned", nvlDash(cis.getLastScannedAt()));
            document.add(cisTable);
            document.add(new Paragraph("\n"));

            // Vulnerability exposure table
            document.add(new Paragraph("Vulnerability Exposure")
                    .setFont(PdfFontFactory.createFont(StandardFonts.HELVETICA_BOLD)).setFontSize(13));
            Table vulnTable = new Table(UnitValue.createPercentArray(new float[]{3, 2})).useAllAvailableWidth();
            addKv(vulnTable, "Critical", str(vuln.getCritical()));
            addKv(vulnTable, "High", str(vuln.getHigh()));
            addKv(vulnTable, "Medium", str(vuln.getMedium()));
            addKv(vulnTable, "Low", str(vuln.getLow()));
            addKv(vulnTable, "Known exploited (KEV)", str(vuln.getKevCount()));
            addKv(vulnTable, "Affected hosts", str(vuln.getAffectedAgents()));
            document.add(vulnTable);

            document.add(new Paragraph("\n"));
            document.add(new Paragraph("Generated by HiveArmor from live CIS and vulnerability "
                    + "telemetry. Empty results reflect no findings in authorized scan coverage, "
                    + "not proof of zero exposure.")
                    .setFont(PdfFontFactory.createFont(StandardFonts.HELVETICA_OBLIQUE))
                    .setFontSize(9).setFontColor(lightText));

            document.close();
            return baos.toByteArray();
        } catch (Exception e) {
            throw new RuntimeException("Posture report PDF generation failed: " + e.getMessage(), e);
        }
    }

    // --- helpers ------------------------------------------------------------

    private void addKv(Table table, String key, String value) {
        try {
            table.addCell(new Cell().add(new Paragraph(key)
                    .setFont(PdfFontFactory.createFont(StandardFonts.HELVETICA)).setFontSize(10)));
            table.addCell(new Cell().add(new Paragraph(value)
                    .setFont(PdfFontFactory.createFont(StandardFonts.HELVETICA_BOLD)).setFontSize(10)));
        } catch (Exception e) {
            throw new RuntimeException("PDF cell render failed: " + e.getMessage(), e);
        }
    }

    private static String row(String... fields) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < fields.length; i++) {
            if (i > 0) {
                sb.append(',');
            }
            sb.append(escapeCsv(fields[i]));
        }
        sb.append("\r\n");
        return sb.toString();
    }

    /** RFC-4180 field escaping: quote when the field holds , " CR or LF; double embedded ". */
    private static String escapeCsv(String field) {
        if (field == null) {
            return "";
        }
        boolean needsQuoting = field.indexOf(',') >= 0 || field.indexOf('"') >= 0
                || field.indexOf('\r') >= 0 || field.indexOf('\n') >= 0;
        if (!needsQuoting) {
            return field;
        }
        StringBuilder sb = new StringBuilder(field.length() + 4).append('"');
        for (int i = 0; i < field.length(); i++) {
            char c = field.charAt(i);
            if (c == '"') {
                sb.append('"');
            }
            sb.append(c);
        }
        return sb.append('"').toString();
    }

    private static String str(int v) {
        return Integer.toString(v);
    }

    private static String str(double v) {
        return Double.toString(v);
    }

    private static String nvl(String v) {
        return v == null ? "" : v;
    }

    private static String nvlDash(String v) {
        return v == null || v.isBlank() ? "—" : v;
    }
}
