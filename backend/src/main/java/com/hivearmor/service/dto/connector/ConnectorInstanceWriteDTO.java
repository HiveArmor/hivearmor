package com.hivearmor.service.dto.connector;

import java.util.List;
import java.util.Map;

public class ConnectorInstanceWriteDTO {

    private String connectorId;
    private String name;
    private Boolean enabled;
    /** Merged public + secret fields from the wizard. Secrets never echoed back. */
    private Map<String, String> config;
    private List<String> allowedCapabilities;

    public String getConnectorId() {
        return connectorId;
    }

    public void setConnectorId(String connectorId) {
        this.connectorId = connectorId;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public Boolean getEnabled() {
        return enabled;
    }

    public void setEnabled(Boolean enabled) {
        this.enabled = enabled;
    }

    public Map<String, String> getConfig() {
        return config;
    }

    public void setConfig(Map<String, String> config) {
        this.config = config;
    }

    public List<String> getAllowedCapabilities() {
        return allowedCapabilities;
    }

    public void setAllowedCapabilities(List<String> allowedCapabilities) {
        this.allowedCapabilities = allowedCapabilities;
    }
}
