package com.hivearmor.domain.connector;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

import java.io.Serializable;
import java.time.Instant;

@Entity
@Table(
    name = "ha_connector_instance",
    uniqueConstraints = @UniqueConstraint(name = "uk_ha_connector_instance_name", columnNames = "name")
)
public class HaConnectorInstance implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "connector_id", nullable = false, length = 64)
    private String connectorId;

    @Column(name = "name", nullable = false, length = 120)
    private String name;

    @Column(name = "enabled", nullable = false)
    private boolean enabled = true;

    /** Non-secret config JSON (e.g. base_url, region). */
    @Column(name = "config_json", columnDefinition = "TEXT")
    private String configJson;

    /** AES-GCM ciphertext of secret field map JSON. Never returned to clients. */
    @Column(name = "secrets_encrypted", columnDefinition = "TEXT")
    private String secretsEncrypted;

    /** Comma-separated capability whitelist; empty = use connector defaults. */
    @Column(name = "allowed_capabilities", length = 512)
    private String allowedCapabilities;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Column(name = "last_tested_at")
    private Instant lastTestedAt;

    @Column(name = "last_test_ok")
    private Boolean lastTestOk;

    @Column(name = "last_test_message", length = 500)
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

    public String getConfigJson() {
        return configJson;
    }

    public void setConfigJson(String configJson) {
        this.configJson = configJson;
    }

    public String getSecretsEncrypted() {
        return secretsEncrypted;
    }

    public void setSecretsEncrypted(String secretsEncrypted) {
        this.secretsEncrypted = secretsEncrypted;
    }

    public String getAllowedCapabilities() {
        return allowedCapabilities;
    }

    public void setAllowedCapabilities(String allowedCapabilities) {
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
