package com.hivearmor.service.dto;

/**
 * Public (unauthenticated) projection of an OIDC provider.
 *
 * Exposes only the fields needed to render the SSO button on the login page:
 * id, providerName, and discoveryUrl.
 *
 * MUST NOT contain clientSecret, clientSecretEncrypted, clientId, or scopes.
 */
public class OidcProviderPublicDTO {

    private Long id;
    private String providerName;
    private String discoveryUrl;

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

    public String getDiscoveryUrl() {
        return discoveryUrl;
    }

    public void setDiscoveryUrl(String discoveryUrl) {
        this.discoveryUrl = discoveryUrl;
    }
}
