package com.hivearmor.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.domain.HaOidcProvider;
import com.hivearmor.domain.HaOidcStateCache;
import com.hivearmor.repository.HaOidcProviderRepository;
import com.hivearmor.repository.HaOidcStateCacheRepository;
import com.hivearmor.security.AesGcmEncryptionService;
import com.hivearmor.security.PkceUtil;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;
import java.util.Map;

/**
 * HiveArmor OIDC service — implements the PKCE authorization flow, code exchange,
 * userinfo retrieval, and user find-or-create logic.
 *
 * <p>Uses the Java 11+ built-in {@link HttpClient} for all outbound HTTP calls.
 * No Spring RestTemplate or WebClient.
 *
 * <p>Constructor injection only — no {@code @Autowired} on fields.
 * No Lombok.
 */
@Service
public class HaOidcService {

    private final HaOidcProviderRepository providerRepository;
    private final HaOidcStateCacheRepository stateCacheRepository;
    private final AesGcmEncryptionService encryptionService;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;

    public HaOidcService(
            HaOidcProviderRepository providerRepository,
            HaOidcStateCacheRepository stateCacheRepository,
            AesGcmEncryptionService encryptionService,
            ObjectMapper objectMapper) {
        this.providerRepository = providerRepository;
        this.stateCacheRepository = stateCacheRepository;
        this.encryptionService = encryptionService;
        this.objectMapper = objectMapper;
        this.httpClient = HttpClient.newHttpClient();
    }

    // -------------------------------------------------------------------------
    // Public API
    // -------------------------------------------------------------------------

    /**
     * Initiates a PKCE authorization flow for the given provider.
     *
     * <p>Generates a {@code code_verifier}, derives a {@code code_challenge} (S256),
     * generates a random {@code state}, fetches the authorization endpoint from the
     * OIDC discovery document, persists a {@link HaOidcStateCache} row, and returns
     * the authorization URL together with the state value.
     *
     * @param providerId  the ID of the {@code ha_oidc_provider} row
     * @param redirectUri the callback URI registered with the identity provider
     * @return map with keys {@code "authorizationUrl"} and {@code "state"}
     * @throws IllegalArgumentException if the provider does not exist
     * @throws IllegalStateException    if the provider is disabled
     */
    @Transactional
    public Map<String, String> initiateAuthFlow(Long providerId, String redirectUri) {
        HaOidcProvider provider = providerRepository.findById(providerId)
                .orElseThrow(() -> new IllegalArgumentException("OIDC provider not found"));

        if (!provider.isEnabled()) {
            throw new IllegalStateException("OIDC provider is disabled");
        }

        String codeVerifier = PkceUtil.generateCodeVerifier();
        String codeChallenge = PkceUtil.generateCodeChallenge(codeVerifier);
        String state = PkceUtil.generateState();

        String authorizationEndpoint = fetchDiscoveryValue(provider.getDiscoveryUrl(), "authorization_endpoint");

        String authorizationUrl = buildAuthorizationUrl(
                authorizationEndpoint,
                provider.getClientId(),
                redirectUri,
                provider.getScopes(),
                state,
                codeChallenge);

        HaOidcStateCache stateCache = new HaOidcStateCache();
        stateCache.setStateValue(state);
        stateCache.setProviderId(provider.getId());
        stateCache.setCodeVerifier(codeVerifier);
        stateCache.setRedirectUri(redirectUri);
        stateCache.setCreatedAt(Instant.now());
        stateCacheRepository.save(stateCache);

        return Map.of("authorizationUrl", authorizationUrl, "state", state);
    }

    /**
     * Exchanges an authorization code for tokens using the stored PKCE state.
     *
     * <p>Looks up the state cache row, validates it has not expired (max 600 seconds),
     * decrypts the client secret, POSTs to the token endpoint, deletes the state row,
     * and returns the decoded ID-token claims map (no signature verification in Sprint 17).
     *
     * @param state the OAuth2 {@code state} parameter from the IdP callback
     * @param code  the authorization code from the IdP callback
     * @return the decoded JWT payload of the {@code id_token} as a claims map
     * @throws IllegalArgumentException if the state is unknown or has expired
     */
    @Transactional
    public Map<String, Object> exchangeCode(String state, String code) {
        HaOidcStateCache row = stateCacheRepository.findByStateValue(state)
                .orElseThrow(() -> new IllegalArgumentException("Unknown OIDC state"));

        if (Instant.now().getEpochSecond() - row.getCreatedAt().getEpochSecond() > 600) {
            stateCacheRepository.delete(row);
            throw new IllegalArgumentException("OIDC state expired");
        }

        HaOidcProvider provider = providerRepository.findById(row.getProviderId())
                .orElseThrow(() -> new IllegalArgumentException("OIDC provider not found for state"));

        String clientSecret = encryptionService.decrypt(provider.getClientSecretEncrypted());

        String tokenEndpoint = fetchTokenEndpoint(provider.getDiscoveryUrl());

        String responseBody = postTokenExchange(
                tokenEndpoint,
                code,
                row.getRedirectUri(),
                provider.getClientId(),
                clientSecret,
                row.getCodeVerifier());

        stateCacheRepository.delete(row);

        return extractIdTokenClaims(responseBody);
    }

    /**
     * Fetches user claims from the OIDC userinfo endpoint.
     *
     * @param accessToken  a valid OAuth2 access token
     * @param discoveryUrl the OIDC discovery URL for the provider
     * @return the userinfo response parsed as a claims map
     */
    public Map<String, Object> getUserInfo(String accessToken, String discoveryUrl) {
        String userinfoEndpoint = fetchUserInfoEndpoint(discoveryUrl);

        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(userinfoEndpoint))
                .header("Authorization", "Bearer " + accessToken)
                .GET()
                .build();

        try {
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            return parseJsonToMap(response.body());
        } catch (IOException | InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("Failed to fetch userinfo from discovery endpoint", e);
        }
    }

    /**
     * Finds an existing HiveArmor user mapped to the given OIDC subject, or stubs
     * a new login string derived from the claims.
     *
     * <p>Sprint 17 stub: full user creation ({@code jhi_user} + {@code ha_oidc_provider_user}
     * rows) is deferred to a future sprint.
     *
     * @param claims     the ID-token / userinfo claims map
     * @param providerId the ID of the OIDC provider
     * @return the HiveArmor login string for the user
     */
    @Transactional
    public String findOrCreateUser(Map<String, Object> claims, Long providerId) {
        String sub = (String) claims.get("sub");
        if (sub == null || sub.isBlank()) {
            throw new IllegalArgumentException("OIDC claims must include a 'sub' field");
        }

        // TODO: look up ha_oidc_provider_user by (oidc_sub, provider_id) using a @Query
        // on HaOidcProviderUserRepository (not yet wired in Sprint 17) and return ha_user_login.

        // Derive a login from email (part before @) or sub (first 50 chars).
        String email = (String) claims.get("email");
        if (email != null && email.contains("@")) {
            String emailPrefix = email.substring(0, email.indexOf('@'));
            // Trim to 50 chars to stay within ha_oidc_provider_user.ha_user_login column length.
            return emailPrefix.length() > 50 ? emailPrefix.substring(0, 50) : emailPrefix;
        }

        // TODO: create jhi_user and ha_oidc_provider_user rows in a future sprint
        return sub.length() > 50 ? sub.substring(0, 50) : sub;
    }

    // -------------------------------------------------------------------------
    // Private helpers — discovery document
    // -------------------------------------------------------------------------

    /**
     * Fetches the OIDC discovery document and returns the string value for {@code key}.
     *
     * @param discoveryUrl the {@code .well-known/openid-configuration} URL
     * @param key          the JSON key to extract (e.g. {@code "authorization_endpoint"})
     * @return the string value associated with {@code key}
     * @throws IllegalStateException if the key is absent or the request fails
     */
    private String fetchDiscoveryValue(String discoveryUrl, String key) {
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(discoveryUrl))
                .GET()
                .build();

        try {
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            Map<?, ?> document = objectMapper.readValue(response.body(), Map.class);
            Object value = document.get(key);
            if (value == null) {
                throw new IllegalStateException(
                        "OIDC discovery document is missing required field: " + key);
            }
            return (String) value;
        } catch (IOException | InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("Failed to fetch OIDC discovery document", e);
        }
    }

    private String fetchTokenEndpoint(String discoveryUrl) {
        return fetchDiscoveryValue(discoveryUrl, "token_endpoint");
    }

    private String fetchUserInfoEndpoint(String discoveryUrl) {
        return fetchDiscoveryValue(discoveryUrl, "userinfo_endpoint");
    }

    private String fetchAuthorizationEndpoint(String discoveryUrl) {
        return fetchDiscoveryValue(discoveryUrl, "authorization_endpoint");
    }

    // -------------------------------------------------------------------------
    // Private helpers — HTTP & JWT
    // -------------------------------------------------------------------------

    /**
     * Builds the PKCE authorization URL with all required query parameters.
     */
    private String buildAuthorizationUrl(
            String authorizationEndpoint,
            String clientId,
            String redirectUri,
            String scope,
            String state,
            String codeChallenge) {

        return authorizationEndpoint
                + "?response_type=" + encode("code")
                + "&client_id=" + encode(clientId)
                + "&redirect_uri=" + encode(redirectUri)
                + "&scope=" + encode(scope)
                + "&state=" + encode(state)
                + "&code_challenge=" + encode(codeChallenge)
                + "&code_challenge_method=" + encode("S256");
    }

    /**
     * POSTs the token exchange request and returns the raw response body.
     */
    private String postTokenExchange(
            String tokenEndpoint,
            String code,
            String redirectUri,
            String clientId,
            String clientSecret,
            String codeVerifier) {

        String body = "grant_type=" + encode("authorization_code")
                + "&code=" + encode(code)
                + "&redirect_uri=" + encode(redirectUri)
                + "&client_id=" + encode(clientId)
                + "&client_secret=" + encode(clientSecret)
                + "&code_verifier=" + encode(codeVerifier);

        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(tokenEndpoint))
                .header("Content-Type", "application/x-www-form-urlencoded")
                .POST(HttpRequest.BodyPublishers.ofString(body))
                .build();

        try {
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            return response.body();
        } catch (IOException | InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("Token exchange HTTP request failed", e);
        }
    }

    /**
     * Extracts and decodes the ID-token JWT payload from a token endpoint response body.
     *
     * <p>Splits on {@code '.'}, takes the middle (payload) segment, Base64URL-decodes it,
     * and parses it as a {@code Map<String, Object>}.
     *
     * @param tokenResponseBody the raw JSON body from the token endpoint
     * @return the decoded JWT payload claims
     * @throws IllegalStateException if the {@code id_token} is absent or malformed
     */
    @SuppressWarnings("unchecked")
    private Map<String, Object> extractIdTokenClaims(String tokenResponseBody) {
        try {
            Map<?, ?> tokenResponse = objectMapper.readValue(tokenResponseBody, Map.class);
            Object idTokenObj = tokenResponse.get("id_token");
            if (idTokenObj == null) {
                throw new IllegalStateException("Token endpoint response does not contain id_token");
            }

            String idToken = (String) idTokenObj;
            String[] parts = idToken.split("\\.");
            if (parts.length < 3) {
                throw new IllegalStateException("id_token is not a valid JWT (expected 3 segments)");
            }

            // Middle segment (index 1) is the JWT payload — Base64URL-decode it.
            byte[] payloadBytes = Base64.getUrlDecoder().decode(padBase64(parts[1]));
            return (Map<String, Object>) objectMapper.readValue(payloadBytes, Map.class);
        } catch (IOException e) {
            throw new IllegalStateException("Failed to parse token endpoint response or JWT payload", e);
        }
    }

    /**
     * Adds Base64 padding characters so that the standard decoder can handle
     * un-padded Base64URL strings produced by JWT encoders.
     */
    private static String padBase64(String base64Url) {
        int pad = 4 - (base64Url.length() % 4);
        if (pad < 4) {
            return base64Url + "=".repeat(pad);
        }
        return base64Url;
    }

    /**
     * URL-encodes a value using UTF-8.
     */
    private static String encode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8);
    }

    /**
     * Parses a JSON string into a raw {@code Map}.
     */
    @SuppressWarnings("unchecked")
    private Map<String, Object> parseJsonToMap(String json) {
        try {
            return (Map<String, Object>) objectMapper.readValue(json, Map.class);
        } catch (IOException e) {
            throw new IllegalStateException("Failed to parse JSON response", e);
        }
    }
}
