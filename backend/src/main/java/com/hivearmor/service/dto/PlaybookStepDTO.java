package com.hivearmor.service.dto;

import java.util.Map;

/**
 * DTO representing a single step within a HiveArmor SOAR playbook.
 *
 * <p>stepType values: "condition" | "action" | "delay" | "loop"</p>
 */
public class PlaybookStepDTO {

    private Integer stepIndex;
    /** Allowed values: "condition", "action", "delay", "loop". */
    private String stepType;
    private String label;
    /** Holds step-type-specific configuration keys and values. */
    private Map<String, Object> config;

    public Integer getStepIndex() {
        return stepIndex;
    }

    public void setStepIndex(Integer stepIndex) {
        this.stepIndex = stepIndex;
    }

    public String getStepType() {
        return stepType;
    }

    public void setStepType(String stepType) {
        this.stepType = stepType;
    }

    public String getLabel() {
        return label;
    }

    public void setLabel(String label) {
        this.label = label;
    }

    public Map<String, Object> getConfig() {
        return config;
    }

    public void setConfig(Map<String, Object> config) {
        this.config = config;
    }
}
