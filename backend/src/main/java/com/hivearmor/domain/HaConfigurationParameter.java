package com.hivearmor.domain;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

/**
 * HiveArmor key/value configuration parameter.
 * <p>
 * Used to persist feature-level runtime tunables such as the SCIM bearer-token hash
 * ({@code SCIM_BEARER_TOKEN_HASH}) and last-used timestamp ({@code SCIM_TOKEN_LAST_USED}).
 * Each row is addressed by {@link #paramKey}; values are stored as plain text (callers
 * are responsible for hashing or encrypting sensitive values before persisting).
 */
@Entity
@Table(name = "ha_configuration_parameter")
public class HaConfigurationParameter implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "param_key", nullable = false, unique = true, length = 100)
    private String paramKey;

    @Column(name = "param_value")
    private String paramValue;

    @Column(name = "updated_at")
    private Instant updatedAt;

    // -------------------------------------------------------------------------
    // Getters and setters — explicit, no Lombok
    // -------------------------------------------------------------------------

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getParamKey() {
        return paramKey;
    }

    public void setParamKey(String paramKey) {
        this.paramKey = paramKey;
    }

    public String getParamValue() {
        return paramValue;
    }

    public void setParamValue(String paramValue) {
        this.paramValue = paramValue;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(Instant updatedAt) {
        this.updatedAt = updatedAt;
    }
}
