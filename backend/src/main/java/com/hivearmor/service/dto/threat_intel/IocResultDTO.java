package com.hivearmor.service.dto.threat_intel;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.domain.threat_intel.UtmIocIndicator;

import java.time.Instant;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.Map;

public class IocResultDTO {

    private String value;
    private String type;
    private Instant firstSeen;
    private Instant lastSeen;
    private Integer threatScore;
    private String classification;
    private String description;
    private String country;
    private String asn;
    private List<String> tags;
    private List<Map<String, Object>> sourceFeds;
    private List<Map<String, Object>> mitreTechniques;
    private List<Map<String, Object>> relatedIocs;
    private Integer alertCount;

    private static final ObjectMapper MAPPER = new ObjectMapper();

    public IocResultDTO() {}

    public static IocResultDTO from(UtmIocIndicator ind) {
        IocResultDTO dto = new IocResultDTO();
        dto.value = ind.getValue();
        dto.type = ind.getIocType();
        dto.firstSeen = ind.getFirstSeen();
        dto.lastSeen = ind.getLastSeen();
        dto.threatScore = ind.getThreatScore();
        dto.classification = ind.getClassification();
        dto.description = ind.getDescription();
        dto.country = ind.getCountry();
        dto.asn = ind.getAsn();
        dto.alertCount = ind.getAlertCount() != null ? ind.getAlertCount() : 0;
        dto.tags = parseTags(ind.getTags());
        dto.sourceFeds = parseJsonList(ind.getSourceFeedsJson());
        dto.mitreTechniques = parseJsonList(ind.getMitreTechniquesJson());
        dto.relatedIocs = parseJsonList(ind.getRelatedIocsJson());
        return dto;
    }

    private static List<String> parseTags(String tags) {
        if (tags == null || tags.isBlank()) return Collections.emptyList();
        return Arrays.asList(tags.split(","));
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> parseJsonList(String json) {
        if (json == null || json.isBlank()) return Collections.emptyList();
        try {
            return MAPPER.readValue(json, new TypeReference<List<Map<String, Object>>>() {});
        } catch (Exception e) {
            return Collections.emptyList();
        }
    }

    public String getValue() { return value; }
    public void setValue(String value) { this.value = value; }
    public String getType() { return type; }
    public void setType(String type) { this.type = type; }
    public Instant getFirstSeen() { return firstSeen; }
    public void setFirstSeen(Instant firstSeen) { this.firstSeen = firstSeen; }
    public Instant getLastSeen() { return lastSeen; }
    public void setLastSeen(Instant lastSeen) { this.lastSeen = lastSeen; }
    public Integer getThreatScore() { return threatScore; }
    public void setThreatScore(Integer threatScore) { this.threatScore = threatScore; }
    public String getClassification() { return classification; }
    public void setClassification(String classification) { this.classification = classification; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    public String getCountry() { return country; }
    public void setCountry(String country) { this.country = country; }
    public String getAsn() { return asn; }
    public void setAsn(String asn) { this.asn = asn; }
    public List<String> getTags() { return tags; }
    public void setTags(List<String> tags) { this.tags = tags; }
    public List<Map<String, Object>> getSourceFeds() { return sourceFeds; }
    public void setSourceFeds(List<Map<String, Object>> sourceFeds) { this.sourceFeds = sourceFeds; }
    public List<Map<String, Object>> getMitreTechniques() { return mitreTechniques; }
    public void setMitreTechniques(List<Map<String, Object>> mitreTechniques) { this.mitreTechniques = mitreTechniques; }
    public List<Map<String, Object>> getRelatedIocs() { return relatedIocs; }
    public void setRelatedIocs(List<Map<String, Object>> relatedIocs) { this.relatedIocs = relatedIocs; }
    public Integer getAlertCount() { return alertCount; }
    public void setAlertCount(Integer alertCount) { this.alertCount = alertCount; }
}
