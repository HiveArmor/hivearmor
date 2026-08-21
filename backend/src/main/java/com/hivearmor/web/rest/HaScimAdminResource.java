package com.hivearmor.web.rest;

import com.hivearmor.domain.HaConfigurationParameter;
import com.hivearmor.repository.HaConfigurationParameterRepository;
import com.hivearmor.service.dto.ScimTokenGenerateResponseDTO;
import com.hivearmor.service.dto.ScimTokenStatusDTO;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.web.bind.annotation.*;

import java.security.SecureRandom;
import java.time.Instant;
import java.util.Base64;
import java.util.Optional;

/**
 * HiveArmor SCIM token lifecycle admin endpoints.
 *
 * <p>Exposes three endpoints under {@code /api/ha-admin/scim/} that allow a
 * {@code ROLE_ADMIN} caller to inspect the current SCIM bearer-token status,
 * generate a new token, and revoke an existing token.
 *
 * <p><strong>Security constraints:</strong>
 * <ul>
 *   <li>All three endpoints require the {@code ROLE_ADMIN} authority.</li>
 *   <li>The plaintext token is surfaced exactly once, in the {@code POST /token} response body.</li>
 *   <li>The token hash is NEVER returned to the caller.</li>
 *   <li>No log statements may include the plaintext token, the hash, or any request body content.</li>
 * </ul>
 */
@RestController
@RequestMapping("/api")
public class HaScimAdminResource {

    private static final String SCIM_TOKEN_KEY = "SCIM_BEARER_TOKEN_HASH";
    private static final String SCIM_LAST_USED_KEY = "SCIM_TOKEN_LAST_USED";

    private static final BCryptPasswordEncoder BCRYPT = new BCryptPasswordEncoder();

    private final HaConfigurationParameterRepository configRepository;

    public HaScimAdminResource(HaConfigurationParameterRepository configRepository) {
        this.configRepository = configRepository;
    }

    // -------------------------------------------------------------------------
    // GET /ha-admin/scim/token/status
    // -------------------------------------------------------------------------

    /**
     * Returns whether a SCIM bearer token is currently configured and when it was
     * last used successfully.
     *
     * <p>The response intentionally does NOT include the token hash or the plaintext
     * value — only two safe metadata fields are returned.
     *
     * @return HTTP 200 with a {@link ScimTokenStatusDTO}
     */
    @GetMapping("/ha-admin/scim/token/status")
    @PreAuthorize("hasAuthority('ROLE_ADMIN')")
    public ResponseEntity<ScimTokenStatusDTO> getTokenStatus() {
        Optional<HaConfigurationParameter> tokenRow = configRepository.findByParamKey(SCIM_TOKEN_KEY);

        boolean configured = tokenRow
            .map(HaConfigurationParameter::getParamValue)
            .filter(v -> v != null && !v.isBlank())
            .isPresent();

        String lastUsed = configRepository.findByParamKey(SCIM_LAST_USED_KEY)
            .map(HaConfigurationParameter::getParamValue)
            .orElse(null);

        ScimTokenStatusDTO dto = new ScimTokenStatusDTO();
        dto.setConfigured(configured);
        dto.setLastUsed(lastUsed);

        return ResponseEntity.ok(dto);
    }

    // -------------------------------------------------------------------------
    // POST /ha-admin/scim/token
    // -------------------------------------------------------------------------

    /**
     * Generates a new SCIM bearer token, bcrypt-hashes it, and upserts the hash into
     * {@code ha_configuration_parameter}.
     *
     * <p>The plaintext token is returned in the response body exactly once and is
     * irrecoverable afterwards — only the bcrypt hash is persisted.
     *
     * <p><strong>Logging prohibition:</strong> this method MUST NOT log the plaintext
     * token, the hash, or any part of the response body.
     *
     * @return HTTP 200 with a {@link ScimTokenGenerateResponseDTO} containing the
     *         plaintext token
     */
    @PostMapping("/ha-admin/scim/token")
    @PreAuthorize("hasAuthority('ROLE_ADMIN')")
    public ResponseEntity<ScimTokenGenerateResponseDTO> generateToken() {
        // Generate 48 cryptographically random bytes and Base64URL-encode without padding
        byte[] bytes = new byte[48];
        new SecureRandom().nextBytes(bytes);
        String rawToken = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);

        // Bcrypt-hash the raw token — only the hash is persisted
        String tokenHash = BCRYPT.encode(rawToken);

        // Upsert: update existing row if present, otherwise create a new one
        HaConfigurationParameter param = configRepository
            .findByParamKey(SCIM_TOKEN_KEY)
            .orElseGet(() -> {
                HaConfigurationParameter newParam = new HaConfigurationParameter();
                newParam.setParamKey(SCIM_TOKEN_KEY);
                return newParam;
            });

        param.setParamValue(tokenHash);
        param.setUpdatedAt(Instant.now());
        configRepository.save(param);

        ScimTokenGenerateResponseDTO response = new ScimTokenGenerateResponseDTO();
        response.setToken(rawToken);

        return ResponseEntity.ok(response);
    }

    // -------------------------------------------------------------------------
    // DELETE /ha-admin/scim/token
    // -------------------------------------------------------------------------

    /**
     * Revokes the current SCIM bearer token by clearing its stored hash.
     *
     * <p>After this call, {@link com.hivearmor.security.ScimTokenAuthFilter} will
     * reject every SCIM request with HTTP 401 until a new token is generated via
     * {@code POST /api/ha-admin/scim/token}.
     *
     * @return HTTP 204 No Content
     */
    @DeleteMapping("/ha-admin/scim/token")
    @PreAuthorize("hasAuthority('ROLE_ADMIN')")
    public ResponseEntity<Void> revokeToken() {
        configRepository.findByParamKey(SCIM_TOKEN_KEY).ifPresent(param -> {
            param.setParamValue(null);
            param.setUpdatedAt(Instant.now());
            configRepository.save(param);
        });

        return ResponseEntity.noContent().build();
    }
}
