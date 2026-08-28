package com.hivearmor.domain.intelligence;

import jakarta.persistence.*;

import java.io.Serializable;

@Entity
@Table(name = "hive_intelligence_finding_inference")
public class HiveIntelligenceFindingInference implements Serializable {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "finding_id", nullable = false)
    private HiveIntelligenceFinding finding;

    @Column(name = "text", columnDefinition = "TEXT", nullable = false)
    private String text;

    @Column(name = "confidence")
    private Double confidence;

    @Column(name = "is_contradiction", nullable = false)
    private Boolean contradiction = false;

    @Column(name = "sort_order", nullable = false)
    private Integer sortOrder = 0;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public HiveIntelligenceFinding getFinding() { return finding; }
    public void setFinding(HiveIntelligenceFinding finding) { this.finding = finding; }
    public String getText() { return text; }
    public void setText(String text) { this.text = text; }
    public Double getConfidence() { return confidence; }
    public void setConfidence(Double confidence) { this.confidence = confidence; }
    public Boolean getContradiction() { return contradiction; }
    public void setContradiction(Boolean contradiction) { this.contradiction = contradiction; }
    public Integer getSortOrder() { return sortOrder; }
    public void setSortOrder(Integer sortOrder) { this.sortOrder = sortOrder; }
}
