package com.hivearmor.domain.intelligence;

import jakarta.persistence.*;

import java.io.Serializable;

@Entity
@Table(name = "hive_intelligence_evidence_gap")
public class HiveIntelligenceEvidenceGap implements Serializable {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "finding_id", nullable = false)
    private HiveIntelligenceFinding finding;

    @Column(name = "text", columnDefinition = "TEXT", nullable = false)
    private String text;

    @Column(name = "sort_order", nullable = false)
    private Integer sortOrder = 0;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public HiveIntelligenceFinding getFinding() { return finding; }
    public void setFinding(HiveIntelligenceFinding finding) { this.finding = finding; }
    public String getText() { return text; }
    public void setText(String text) { this.text = text; }
    public Integer getSortOrder() { return sortOrder; }
    public void setSortOrder(Integer sortOrder) { this.sortOrder = sortOrder; }
}
