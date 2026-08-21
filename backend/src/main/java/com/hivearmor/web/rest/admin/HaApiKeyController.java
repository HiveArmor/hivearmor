package com.hivearmor.web.rest.admin;

import com.hivearmor.security.AuthoritiesConstants;
import com.hivearmor.service.admin.api_key.HaApiKeyService;
import com.hivearmor.service.dto.admin.api_key.HaApiKeyCreateDTO;
import com.hivearmor.service.dto.admin.api_key.HaApiKeyCreatedDTO;
import com.hivearmor.service.dto.admin.api_key.HaApiKeyResponseDTO;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

/**
 * REST controller for HiveArmor API Key management (S20-T02, Requirements 5–6).
 *
 * <h3>Endpoint summary</h3>
 * <pre>
 *   POST   /api/ha-admin/api-keys       → create a new key; returns HTTP 201 with plaintext token once
 *   GET    /api/ha-admin/api-keys       → list all keys; never includes token or keyHash
 *   GET    /api/ha-admin/api-keys/{id}  → get a single key; never includes token or keyHash
 *   DELETE /api/ha-admin/api-keys/{id}  → revoke a key; returns HTTP 204
 * </pre>
 *
 * <p>Every method is protected by {@code @PreAuthorize("hasAuthority('ROLE_ADMIN')")}
 * (Requirements 13.2, 13.3).
 *
 * <h3>Secret hygiene (Requirements 5.4, 5.5, 5.6)</h3>
 * <ul>
 *   <li>The plaintext token is returned exactly once in the {@code POST} response
 *       via {@link HaApiKeyCreatedDTO} and never stored beyond that HTTP response.</li>
 *   <li>All {@code GET} responses return {@link HaApiKeyResponseDTO}, which
 *       intentionally omits the {@code token} and {@code keyHash} fields.</li>
 *   <li>The plaintext token is never written to any log statement at any level.</li>
 * </ul>
 */
@RestController
@RequestMapping("/api/ha-admin/api-keys")
@RequiredArgsConstructor
public class HaApiKeyController {

    private static final Logger log = LoggerFactory.getLogger(HaApiKeyController.class);

    private final HaApiKeyService service;

    // =========================================================================
    // POST — create API key (Requirements 5.1, 5.2, 5.3, 5.4, 6.1, 6.2)
    // =========================================================================

    /**
     * Creates a new API key and returns the plaintext token exactly once.
     *
     * <p>The token value is generated server-side via {@link HaApiKeyService#create};
     * it is bcrypt-hashed before persistence and returned in the response body under
     * the {@code token} field. HiveArmor cannot recover the plaintext token after this
     * response is delivered (Requirement 5.4).
     *
     * <p>Scope strings are validated against the fixed set defined in
     * {@link com.hivearmor.domain.enumeration.HaApiKeyScope}; an unrecognised scope
     * causes HTTP 400 / {@code scope.unknown} (Requirements 6.1, 6.2).
     *
     * @param dto    the creation payload: {@code name}, {@code scopes},
     *               optional {@code expiresAt}; validated before service delegation
     * @param caller the authenticated principal; its username is recorded as the
     *               {@code created_by} value on the stored record
     * @return HTTP 201 with {@link HaApiKeyCreatedDTO} containing all record fields
     *         plus the one-time plaintext token
     */
    @PostMapping
    @PreAuthorize("hasAuthority('" + AuthoritiesConstants.ADMIN + "')")
    public ResponseEntity<HaApiKeyCreatedDTO> create(
            @Valid @RequestBody HaApiKeyCreateDTO dto,
            @AuthenticationPrincipal UserDetails caller) {
        HaApiKeyCreatedDTO created = service.create(dto, caller.getUsername());
        // Intentionally do NOT log the token or keyPrefix to protect secret material.
        log.debug("HaApiKeyController: API key created — id={}", created.getId());
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    // =========================================================================
    // GET — list all API keys (Requirements 5.5, 13.2, 13.3)
    // =========================================================================

    /**
     * Returns all API key records.
     *
     * <p>The response list never includes the plaintext {@code token} or the bcrypt
     * {@code keyHash} fields (Requirement 5.5). The {@code status} field on each
     * record is computed at read-time from {@code revokedAt} and {@code expiresAt}.
     *
     * @return HTTP 200 with the list of API key records; may be empty but never
     *         {@code null}
     */
    @GetMapping
    @PreAuthorize("hasAuthority('" + AuthoritiesConstants.ADMIN + "')")
    public ResponseEntity<List<HaApiKeyResponseDTO>> list() {
        return ResponseEntity.ok(service.list());
    }

    // =========================================================================
    // GET /{id} — get single API key (Requirements 5.6, 13.2, 13.3)
    // =========================================================================

    /**
     * Returns a single API key record by UUID.
     *
     * <p>The response never includes the plaintext {@code token} or the bcrypt
     * {@code keyHash} fields (Requirement 5.6).
     *
     * @param id the UUID of the API key to retrieve
     * @return HTTP 200 with the matching {@link HaApiKeyResponseDTO}
     * @throws org.springframework.web.server.ResponseStatusException HTTP 404 if no
     *         record with the given id exists (propagated from service)
     */
    @GetMapping("/{id}")
    @PreAuthorize("hasAuthority('" + AuthoritiesConstants.ADMIN + "')")
    public ResponseEntity<HaApiKeyResponseDTO> get(@PathVariable UUID id) {
        return ResponseEntity.ok(service.get(id));
    }

    // =========================================================================
    // DELETE /{id} — revoke API key (Requirements 6.4, 13.2, 13.3)
    // =========================================================================

    /**
     * Revokes an API key by setting its {@code revokedAt} timestamp to the current
     * server time.
     *
     * <p>After this call, the key's computed {@code status} transitions to
     * {@code revoked} and any authentication attempt using that key will be rejected
     * with HTTP 401 (Requirements 6.4, 6.5).
     *
     * @param id the UUID of the API key to revoke
     * @return HTTP 204 with no body on success
     * @throws org.springframework.web.server.ResponseStatusException HTTP 404 if no
     *         record with the given id exists (propagated from service)
     */
    @DeleteMapping("/{id}")
    @PreAuthorize("hasAuthority('" + AuthoritiesConstants.ADMIN + "')")
    public ResponseEntity<Void> revoke(@PathVariable UUID id) {
        service.revoke(id);
        log.debug("HaApiKeyController: API key revoked — id={}", id);
        return ResponseEntity.noContent().build();
    }
}
