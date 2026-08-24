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

/**
 * ADR-20260824 staging queue for connector-pulled alerts.
 *
 * <p>Lives in PostgreSQL only — never written to {@code v3-hive-alert-*} OpenSearch
 * indices. Downstream EP bridge requires a follow-up ADR.
 */
@Entity
@Table(
    name = "ha_connector_alert_staging",
    uniqueConstraints = @UniqueConstraint(
        name = "uk_ha_connector_alert_staging_instance_ext",
        columnNames = {"connector_instance_id", "external_id"}
    )
)
public class HaConnectorAlertStaging implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "connector_instance_id", nullable = false)
    private Long connectorInstanceId;

    @Column(name = "connector_id", nullable = false, length = 64)
    private String connectorId;

    @Column(name = "external_id", nullable = false, length = 256)
    private String externalId;

    @Column(name = "title", length = 512)
    private String title;

    @Column(name = "description", columnDefinition = "TEXT")
    private String description;

    @Column(name = "severity", length = 64)
    private String severity;

    @Column(name = "hostname", length = 256)
    private String hostname;

    @Column(name = "src_ip", length = 64)
    private String srcIp;

    @Column(name = "mitre_techniques", length = 512)
    private String mitreTechniques;

    @Column(name = "alert_created_at")
    private Instant alertCreatedAt;

    @Column(name = "raw_json", columnDefinition = "TEXT")
    private String rawJson;

    @Column(name = "ingest_batch_id", nullable = false, length = 64)
    private String ingestBatchId;

    @Column(name = "ingested_at", nullable = false)
    private Instant ingestedAt;

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public Long getConnectorInstanceId() {
        return connectorInstanceId;
    }

    public void setConnectorInstanceId(Long connectorInstanceId) {
        this.connectorInstanceId = connectorInstanceId;
    }

    public String getConnectorId() {
        return connectorId;
    }

    public void setConnectorId(String connectorId) {
        this.connectorId = connectorId;
    }

    public String getExternalId() {
        return externalId;
    }

    public void setExternalId(String externalId) {
        this.externalId = externalId;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public String getSeverity() {
        return severity;
    }

    public void setSeverity(String severity) {
        this.severity = severity;
    }

    public String getHostname() {
        return hostname;
    }

    public void setHostname(String hostname) {
        this.hostname = hostname;
    }

    public String getSrcIp() {
        return srcIp;
    }

    public void setSrcIp(String srcIp) {
        this.srcIp = srcIp;
    }

    public String getMitreTechniques() {
        return mitreTechniques;
    }

    public void setMitreTechniques(String mitreTechniques) {
        this.mitreTechniques = mitreTechniques;
    }

    public Instant getAlertCreatedAt() {
        return alertCreatedAt;
    }

    public void setAlertCreatedAt(Instant alertCreatedAt) {
        this.alertCreatedAt = alertCreatedAt;
    }

    public String getRawJson() {
        return rawJson;
    }

    public void setRawJson(String rawJson) {
        this.rawJson = rawJson;
    }

    public String getIngestBatchId() {
        return ingestBatchId;
    }

    public void setIngestBatchId(String ingestBatchId) {
        this.ingestBatchId = ingestBatchId;
    }

    public Instant getIngestedAt() {
        return ingestedAt;
    }

    public void setIngestedAt(Instant ingestedAt) {
        this.ingestedAt = ingestedAt;
    }
}
