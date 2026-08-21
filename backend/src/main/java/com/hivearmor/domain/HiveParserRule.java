package com.hivearmor.domain;

import jakarta.persistence.*;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.io.Serializable;
import java.time.Instant;

/**
 * A YAML-based log parser rule managed via the Data Parsing page.
 *
 * Backs /api/ha-parsers
 */
@Entity
@Table(name = "hive_parser_rule")
@EntityListeners(AuditingEntityListener.class)
public class HiveParserRule implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 255)
    private String name;

    @Column(name = "data_type", nullable = false, length = 128)
    private String dataType;

    /** active | inactive | error */
    @Column(nullable = false, length = 16)
    private String status = "inactive";

    @Column(name = "last_matched_count", nullable = false)
    private Long lastMatchedCount = 0L;

    @Column(name = "yaml_body", nullable = false, columnDefinition = "text")
    private String yamlBody;

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @LastModifiedDate
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    // ---- getters / setters ----

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getDataType() { return dataType; }
    public void setDataType(String dataType) { this.dataType = dataType; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public Long getLastMatchedCount() { return lastMatchedCount; }
    public void setLastMatchedCount(Long lastMatchedCount) { this.lastMatchedCount = lastMatchedCount; }

    public String getYamlBody() { return yamlBody; }
    public void setYamlBody(String yamlBody) { this.yamlBody = yamlBody; }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }

    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}
