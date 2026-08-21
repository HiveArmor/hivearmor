package com.hivearmor.domain;

import jakarta.persistence.*;

import java.io.Serializable;
import java.time.Instant;

/**
 * JPA entity for the ha_oidc_state_cache table.
 *
 * Holds short-lived PKCE state between the /authorize redirect and the /callback
 * response. Each row is keyed by the random state value and is deleted after the
 * code exchange completes or after 600 seconds (expiry enforced in HaOidcService).
 *
 * No Lombok — all accessors are explicit public methods.
 */
@Entity
@Table(name = "ha_oidc_state_cache")
public class HaOidcStateCache implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "state_value", nullable = false, unique = true)
    private String stateValue;

    @Column(name = "provider_id", nullable = false)
    private Long providerId;

    @Column(name = "code_verifier", nullable = false, columnDefinition = "TEXT")
    private String codeVerifier;

    @Column(name = "redirect_uri", nullable = false, columnDefinition = "TEXT")
    private String redirectUri;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    // ---- getters / setters ----

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getStateValue() {
        return stateValue;
    }

    public void setStateValue(String stateValue) {
        this.stateValue = stateValue;
    }

    public Long getProviderId() {
        return providerId;
    }

    public void setProviderId(Long providerId) {
        this.providerId = providerId;
    }

    public String getCodeVerifier() {
        return codeVerifier;
    }

    public void setCodeVerifier(String codeVerifier) {
        this.codeVerifier = codeVerifier;
    }

    public String getRedirectUri() {
        return redirectUri;
    }

    public void setRedirectUri(String redirectUri) {
        this.redirectUri = redirectUri;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }
}
