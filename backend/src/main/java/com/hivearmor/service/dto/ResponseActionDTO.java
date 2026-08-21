package com.hivearmor.service.dto;

import java.util.List;

/**
 * DTO representing a single response action in the SOAR action library.
 * <p>
 * {@code handler} and {@code timeoutMs} are intentionally omitted — they are
 * internal execution details and must not be exposed to the UI layer.
 * {@code usageCount} is computed at query time by scanning
 * {@code hive_playbook.definition_json} for references to this action's id.
 * </p>
 * No Lombok — all accessors are explicit public methods.
 */
public class ResponseActionDTO {

    private String id;
    private String name;
    private String category;
    private String description;
    private List<ResponseActionParamDTO> params;
    private Integer usageCount;

    // -------------------------------------------------------------------------
    // Getters
    // -------------------------------------------------------------------------

    public String getId() {
        return id;
    }

    public String getName() {
        return name;
    }

    public String getCategory() {
        return category;
    }

    public String getDescription() {
        return description;
    }

    public List<ResponseActionParamDTO> getParams() {
        return params;
    }

    public Integer getUsageCount() {
        return usageCount;
    }

    // -------------------------------------------------------------------------
    // Setters
    // -------------------------------------------------------------------------

    public void setId(String id) {
        this.id = id;
    }

    public void setName(String name) {
        this.name = name;
    }

    public void setCategory(String category) {
        this.category = category;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public void setParams(List<ResponseActionParamDTO> params) {
        this.params = params;
    }

    public void setUsageCount(Integer usageCount) {
        this.usageCount = usageCount;
    }
}
