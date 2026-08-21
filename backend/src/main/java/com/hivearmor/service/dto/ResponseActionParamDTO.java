package com.hivearmor.service.dto;

import java.util.List;

/**
 * DTO representing a single parameter definition for a response action.
 * <p>
 * Valid values for {@code type}: {@code "string"}, {@code "integer"},
 * {@code "text"}, {@code "select"}, {@code "boolean"}.
 * </p>
 * <p>
 * {@code options} is populated only when {@code type} equals {@code "select"};
 * it MUST be {@code null} for all other types.
 * </p>
 * No Lombok — all accessors are explicit public methods.
 */
public class ResponseActionParamDTO {

    private String name;

    /** One of: "string" | "integer" | "text" | "select" | "boolean". */
    private String type;

    private boolean required;

    /** Scalar default value; runtime type must agree with {@code type}. */
    private Object defaultValue;

    /** Non-null only when {@code type} is {@code "select"}. */
    private List<String> options;

    // -------------------------------------------------------------------------
    // Getters
    // -------------------------------------------------------------------------

    public String getName() {
        return name;
    }

    public String getType() {
        return type;
    }

    public boolean isRequired() {
        return required;
    }

    public Object getDefaultValue() {
        return defaultValue;
    }

    public List<String> getOptions() {
        return options;
    }

    // -------------------------------------------------------------------------
    // Setters
    // -------------------------------------------------------------------------

    public void setName(String name) {
        this.name = name;
    }

    public void setType(String type) {
        this.type = type;
    }

    public void setRequired(boolean required) {
        this.required = required;
    }

    public void setDefaultValue(Object defaultValue) {
        this.defaultValue = defaultValue;
    }

    public void setOptions(List<String> options) {
        this.options = options;
    }
}
