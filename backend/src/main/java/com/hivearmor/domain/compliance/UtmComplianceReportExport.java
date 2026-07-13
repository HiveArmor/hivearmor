package com.hivearmor.domain.compliance;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

@Entity
@Table(name = "hive_compliance_report_export")
public class UtmComplianceReportExport implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "report_name", length = 200, nullable = false)
    private String reportName;

    @Column(name = "standard", length = 100, nullable = false)
    private String standard;

    @Column(name = "status", length = 20, nullable = false)
    private String status = "Pending";

    @Column(name = "created_date", nullable = false)
    private Instant createdDate;

    @Column(name = "created_by", length = 100)
    private String createdBy;

    @Column(name = "pdf_path", columnDefinition = "TEXT")
    private String pdfPath;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getReportName() { return reportName; }
    public void setReportName(String reportName) { this.reportName = reportName; }
    public String getStandard() { return standard; }
    public void setStandard(String standard) { this.standard = standard; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public Instant getCreatedDate() { return createdDate; }
    public void setCreatedDate(Instant createdDate) { this.createdDate = createdDate; }
    public String getCreatedBy() { return createdBy; }
    public void setCreatedBy(String createdBy) { this.createdBy = createdBy; }
    public String getPdfPath() { return pdfPath; }
    public void setPdfPath(String pdfPath) { this.pdfPath = pdfPath; }
}
