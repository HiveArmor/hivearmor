package com.hivearmor.web.rest.hunt.dto;

import java.util.List;

/**
 * DTO describing a field's metadata for the Search &amp; Hunt field browser.
 *
 * <p>Matches the frontend {@code HuntFieldDefinition} interface. Used by the
 * field browser rail, autocomplete, and column selection.
 */
public class HuntFieldDefinitionDTO {

    private String name;
    private String label;
    private String type;
    private String category;
    private String description;
    private List<String> operators;
    private Double coverage;
    private Long cardinality;
    private List<String> sampleValues;

    public HuntFieldDefinitionDTO() {}

    public HuntFieldDefinitionDTO(String name, String label, String type,
                                   String category, String description,
                                   List<String> operators) {
        this.name = name;
        this.label = label;
        this.type = type;
        this.category = category;
        this.description = description;
        this.operators = operators;
    }

    // Getters and setters

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getLabel() { return label; }
    public void setLabel(String label) { this.label = label; }

    public String getType() { return type; }
    public void setType(String type) { this.type = type; }

    public String getCategory() { return category; }
    public void setCategory(String category) { this.category = category; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }

    public List<String> getOperators() { return operators; }
    public void setOperators(List<String> operators) { this.operators = operators; }

    public Double getCoverage() { return coverage; }
    public void setCoverage(Double coverage) { this.coverage = coverage; }

    public Long getCardinality() { return cardinality; }
    public void setCardinality(Long cardinality) { this.cardinality = cardinality; }

    public List<String> getSampleValues() { return sampleValues; }
    public void setSampleValues(List<String> sampleValues) { this.sampleValues = sampleValues; }
}
