package com.hivearmor.service.connector;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Wizard field description for connector configuration (JSON-shaped for the UI).
 */
public final class ConnectorField {

    private final String name;
    private final String type;
    private final String label;
    private final boolean required;
    private final boolean secret;
    private final String defaultValue;
    private final String helpText;

    public ConnectorField(
            String name,
            String type,
            String label,
            boolean required,
            boolean secret,
            String defaultValue,
            String helpText) {
        this.name = name;
        this.type = type;
        this.label = label;
        this.required = required;
        this.secret = secret;
        this.defaultValue = defaultValue;
        this.helpText = helpText;
    }

    public static ConnectorField string(String name, String label) {
        return new ConnectorField(name, "string", label, true, false, null, null);
    }

    public static ConnectorField stringOptional(String name, String label, String defaultValue, String help) {
        return new ConnectorField(name, "string", label, false, false, defaultValue, help);
    }

    public static ConnectorField secret(String name, String label) {
        return new ConnectorField(name, "secret", label, true, true, null, null);
    }

    public String getName() {
        return name;
    }

    public String getType() {
        return type;
    }

    public String getLabel() {
        return label;
    }

    public boolean isRequired() {
        return required;
    }

    public boolean isSecret() {
        return secret;
    }

    public String getDefaultValue() {
        return defaultValue;
    }

    public String getHelpText() {
        return helpText;
    }

    public Map<String, Object> toMap() {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("name", name);
        m.put("type", type);
        m.put("label", label);
        m.put("required", required);
        m.put("secret", secret);
        if (defaultValue != null) {
            m.put("defaultValue", defaultValue);
        }
        if (helpText != null) {
            m.put("helpText", helpText);
        }
        return m;
    }
}
