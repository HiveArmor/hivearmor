package com.hivearmor.domain.intelligence;

import jakarta.persistence.*;

import java.io.Serializable;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "hive_intelligence_finding")
public class HiveIntelligenceFinding implements Serializable {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "tenant_id")
    private Long tenantId;

    @Column(name = "title", length = 512)
    private String title;

    @Column(name = "summary", columnDefinition = "TEXT")
    private String summary;

    @Column(name = "answer", columnDefinition = "TEXT")
    private String answer;

    @Column(name = "confidence", nullable = false)
    private Double confidence = 0.0;

    @Column(name = "confidence_explanation", columnDefinition = "TEXT")
    private String confidenceExplanation;

    @Column(name = "provenance", length = 128)
    private String provenance;

    @Column(name = "context_type", length = 64)
    private String contextType;

    @Column(name = "context_ref", length = 512)
    private String contextRef;

    @Column(name = "sources_json", columnDefinition = "TEXT")
    private String sourcesJson;

    @Column(name = "created_by", nullable = false, length = 255)
    private String createdBy;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    @OneToMany(mappedBy = "finding", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("sortOrder ASC")
    private List<HiveIntelligenceFindingFact> facts = new ArrayList<>();

    @OneToMany(mappedBy = "finding", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("sortOrder ASC")
    private List<HiveIntelligenceFindingInference> inferences = new ArrayList<>();

    @OneToMany(mappedBy = "finding", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("sortOrder ASC")
    private List<HiveIntelligenceEvidenceGap> evidenceGaps = new ArrayList<>();

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getTenantId() { return tenantId; }
    public void setTenantId(Long tenantId) { this.tenantId = tenantId; }
    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }
    public String getSummary() { return summary; }
    public void setSummary(String summary) { this.summary = summary; }
    public String getAnswer() { return answer; }
    public void setAnswer(String answer) { this.answer = answer; }
    public Double getConfidence() { return confidence; }
    public void setConfidence(Double confidence) { this.confidence = confidence; }
    public String getConfidenceExplanation() { return confidenceExplanation; }
    public void setConfidenceExplanation(String confidenceExplanation) { this.confidenceExplanation = confidenceExplanation; }
    public String getProvenance() { return provenance; }
    public void setProvenance(String provenance) { this.provenance = provenance; }
    public String getContextType() { return contextType; }
    public void setContextType(String contextType) { this.contextType = contextType; }
    public String getContextRef() { return contextRef; }
    public void setContextRef(String contextRef) { this.contextRef = contextRef; }
    public String getSourcesJson() { return sourcesJson; }
    public void setSourcesJson(String sourcesJson) { this.sourcesJson = sourcesJson; }
    public String getCreatedBy() { return createdBy; }
    public void setCreatedBy(String createdBy) { this.createdBy = createdBy; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
    public List<HiveIntelligenceFindingFact> getFacts() { return facts; }
    public void setFacts(List<HiveIntelligenceFindingFact> facts) { this.facts = facts; }
    public List<HiveIntelligenceFindingInference> getInferences() { return inferences; }
    public void setInferences(List<HiveIntelligenceFindingInference> inferences) { this.inferences = inferences; }
    public List<HiveIntelligenceEvidenceGap> getEvidenceGaps() { return evidenceGaps; }
    public void setEvidenceGaps(List<HiveIntelligenceEvidenceGap> evidenceGaps) { this.evidenceGaps = evidenceGaps; }
}
