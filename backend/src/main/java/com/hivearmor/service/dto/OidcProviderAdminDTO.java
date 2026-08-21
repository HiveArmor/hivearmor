package com.hivearmor.service.dto;

/**
 * Admin projection of an OIDC provider.
 *
 * Used for ROLE_ADMIN CRUD endpoints (GET/POST/PUT /api/ha-oidc/providers).
 *
 * The {@code clientSecret} field is write-only:
 * - On POST/PUT requests it carries the plaintext secret supplied by the admin.
 * - On any response from the backend it MUST always be set to {@code null}.
 *   The service/resource layer is responsible for enforcing this invariant.
 *
 * The {@code clientSecretEncrypted} column value is NEVER included here.
 */
public class OidcProviderAdminDTO {

    private Long id;
    private String providerName;
    private String clientId;

    /**
     * Write-only. Always {@code null} on responses; populated on inbound
     * POST/PUT bodies when the admin supplies a new secret.
     */
    private String clientSecret;

    private String discoveryUrl;
    private String scopes;
    private boolean enabled;
    private String createdAt;
    private String updatedAt;

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getProviderName() {
        return providerName;
    }

    public void setProviderName(String providerName) {
        this.providerName = providerName;
    }

    public String getClientId() {
        return clientId;
    }

    public void setClientId(String clientId) {
        this.clientId = clientId;
    }

    public String getClientSecret() {
        return clientSecret;
    }

    public void setClientSecret(String clientSecret) {
        this.clientSecret = clientSecret;
    }

    public String getDiscoveryUrl() {
        return discoveryUrl;
    }

    public void setDiscoveryUrl(String discoveryUrl) {
        this.discoveryUrl = discoveryUrl;
    }

    public String getScopes() {
        return scopes;
    }

    public void setScopes(String scopes) {
        this.scopes = scopes;
    }

    public boolean isEnabled() {
        return enabled;
    }

    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
    }

    public String getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(String createdAt) {
        this.createdAt = createdAt;
    }

    public String getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(String updatedAt) {
        this.updatedAt = updatedAt;
    }
}
