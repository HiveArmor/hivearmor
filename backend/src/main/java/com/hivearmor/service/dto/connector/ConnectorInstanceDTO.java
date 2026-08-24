package com.hivearmor.service.dto.connector;

import java.time.Instant;
import java.util.List;
import java.util.Map;

public class ConnectorInstanceDTO {

    private Long id;
    private String connectorId;
    private String connectorName;
    private String category;
    private String name;
    private boolean enabled;
    private Map<String, String> configPublic;
    private List<String> secretFieldsConfigured;
    private List<String> capabilities;
    private List<String> allowedCapabilities;
    private Instant createdAt;
    private Instant updatedAt;
    private Instant lastTestedAt;
    private Boolean lastTestOk;
    private String lastTestMessage;

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getConnectorId() {
        return connectorId;
    }

    public void setConnectorId(String connectorId) {
        this.connectorId = connectorId;
    }

    public String getConnectorName() {
        return connectorName;
    }

    public void setConnectorName(String connectorName) {
        this.connectorName = connectorName;
    }

    public String getCategory() {
        return category;
    }

    public void setCategory(String category) {
        this.category = category;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public boolean isEnabled() {
        return enabled;
    }

    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
    }

    public Map<String, String> getConfigPublic() {
        return configPublic;
    }

    public void setConfigPublic(Map<String, String> configPublic) {
        this.configPublic = configPublic;
    }

    public List<String> getSecretFieldsConfigured() {
        return secretFieldsConfigured;
    }

    public void setSecretFieldsConfigured(List<String> secretFieldsConfigured) {
        this.secretFieldsConfigured = secretFieldsConfigured;
    }

    public List<String> getCapabilities() {
        return capabilities;
    }

    public void setCapabilities(List<String> capabilities) {
        this.capabilities = capabilities;
    }

    public List<String> getAllowedCapabilities() {
        return allowedCapabilities;
    }

    public void setAllowedCapabilities(List<String> allowedCapabilities) {
        this.allowedCapabilities = allowedCapabilities;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(Instant updatedAt) {
        this.updatedAt = updatedAt;
    }

    public Instant getLastTestedAt() {
        return lastTestedAt;
    }

    public void setLastTestedAt(Instant lastTestedAt) {
        this.lastTestedAt = lastTestedAt;
    }

    public Boolean getLastTestOk() {
        return lastTestOk;
    }

    public void setLastTestOk(Boolean lastTestOk) {
        this.lastTestOk = lastTestOk;
    }

    public String getLastTestMessage() {
        return lastTestMessage;
    }

    public void setLastTestMessage(String lastTestMessage) {
        this.lastTestMessage = lastTestMessage;
    }
}
