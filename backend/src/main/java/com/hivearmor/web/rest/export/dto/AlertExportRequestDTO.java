package com.hivearmor.web.rest.export.dto;

import com.hivearmor.domain.shared_types.DataColumn;

/**
 * Request body for {@code POST /api/ha-alerts/export} (B0-4).
 *
 * <p>Carries the committed alert-queue filter context. Fields mirror the alert-queue
 * list filters ({@code severity}, {@code status}, time range, {@code category},
 * {@code assignee}, {@code tags}, {@code riskMin}, {@code q}). The service translates
 * them into the {@code List<FilterType>} consumed by {@code searchStream}.
 * {@code columns} is required for CSV, ignored for NDJSON.
 */
public class AlertExportRequestDTO {

    private String severity;
    private String status;
    private String from;
    private String to;
    private String category;
    private String assignee;
    private String tags;
    private String riskMin;
    private String q;

    /** Target index pattern; if blank the tenant-resolved alert pattern is used. */
    private String indexPattern;

    private DataColumn[] columns;

    /** {@code csv} | {@code ndjson}. */
    private String format;

    public String getSeverity() { return severity; }
    public void setSeverity(String severity) { this.severity = severity; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public String getFrom() { return from; }
    public void setFrom(String from) { this.from = from; }

    public String getTo() { return to; }
    public void setTo(String to) { this.to = to; }

    public String getCategory() { return category; }
    public void setCategory(String category) { this.category = category; }

    public String getAssignee() { return assignee; }
    public void setAssignee(String assignee) { this.assignee = assignee; }

    public String getTags() { return tags; }
    public void setTags(String tags) { this.tags = tags; }

    public String getRiskMin() { return riskMin; }
    public void setRiskMin(String riskMin) { this.riskMin = riskMin; }

    public String getQ() { return q; }
    public void setQ(String q) { this.q = q; }

    public String getIndexPattern() { return indexPattern; }
    public void setIndexPattern(String indexPattern) { this.indexPattern = indexPattern; }

    public DataColumn[] getColumns() { return columns; }
    public void setColumns(DataColumn[] columns) { this.columns = columns; }

    public String getFormat() { return format; }
    public void setFormat(String format) { this.format = format; }
}
