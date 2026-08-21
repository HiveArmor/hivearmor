package com.hivearmor.service.admin.api_key;

import com.hivearmor.domain.HaApiKey;
import com.hivearmor.domain.enumeration.ApiKeyStatus;
import com.hivearmor.domain.enumeration.HaApiKeyScope;
import com.hivearmor.repository.HaApiKeyRepository;
import com.hivearmor.service.dto.admin.api_key.HaApiKeyCreateDTO;
import com.hivearmor.service.dto.admin.api_key.HaApiKeyCreatedDTO;
import com.hivearmor.service.dto.admin.api_key.HaApiKeyResponseDTO;
import com.hivearmor.web.rest.errors.BadRequestAlertException;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * Service layer for HiveArmor API Key management (S20-T02, Requirements 4–6).
 *
 * <h3>Security invariants</h3>
 * <ul>
 *   <li>Plaintext tokens are generated once, bcrypt-hashed (strength 10), and
 *       then discarded — only the hash is persisted (Requirement 4.5, 5.3).</li>
 *   <li>The plaintext token is returned to the caller exactly once via
 *       {@link HaApiKeyCreatedDTO} and is never stored beyond that response
 *       (Requirement 5.4).</li>
 *   <li>{@link #list()} and {@link #get(UUID)} always return
 *       {@link HaApiKeyResponseDTO}, which never contains the {@code token} or
 *       {@code keyHash} fields (Requirements 5.5, 5.6).</li>
 * </ul>
 *
 * <h3>Status computation</h3>
 * <p>Status is not persisted — it is derived at read-time by the pure static method
 * {@link #computeStatus(Instant, Instant, Instant)}, which is exposed as
 * {@code public static} to facilitate property-based testing (Property 9).
 *
 * <h3>Scope validation</h3>
 * <p>Scope strings are validated against {@link HaApiKeyScope} before any write.
 * An unknown scope causes a {@code 400 Bad Request} with error code
 * {@code scope.unknown} (Requirement 6.2).
 */
@Service
@RequiredArgsConstructor
public class HaApiKeyService {

    private static final Logger log = LoggerFactory.getLogger(HaApiKeyService.class);

    /** Entity name used in {@link BadRequestAlertException} payloads. */
    private static final String ENTITY_NAME = "apiKey";

    private final HaApiKeyRepository repo;
    private final HaApiKeyTokenGenerator tokenGen;

    /**
     * BCrypt encoder at strength 10 as required by Requirement 4.5.
     * <p>This encoder is intentionally allocated as a field rather than a Spring
     * bean so that its cost factor is always exactly 10 and cannot be overridden
     * by external configuration.
     */
    private final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder(10);

    // =========================================================================
    // CRUD operations
    // =========================================================================

    /**
     * Creates a new API key, hashes its token, persists the record, and returns
     * the plaintext token exactly once.
     *
     * <p>Steps performed:
     * <ol>
     *   <li>Validate all scope strings against {@link HaApiKeyScope} (Req 6.1, 6.2).</li>
     *   <li>Generate a cryptographically random token via
     *       {@link HaApiKeyTokenGenerator#generate()} (Req 5.2).</li>
     *   <li>Bcrypt-hash the token at strength 10 and store the hash (Req 4.5, 5.3).</li>
     *   <li>Persist the first 8 characters of the token as {@code key_prefix}
     *       for O(1) narrowing during authentication (Req 5.3).</li>
     *   <li>Return {@link HaApiKeyCreatedDTO} containing the plaintext token
     *       (Req 5.4).</li>
     * </ol>
     *
     * @param dto   the creation payload; must not be {@code null}
     * @param actor the login name of the administrator creating the key
     * @return a DTO containing all record fields plus the plaintext token (once only)
     * @throws BadRequestAlertException if any scope value is not in
     *         {@link HaApiKeyScope} (error code {@code scope.unknown})
     */
    @Transactional
    public HaApiKeyCreatedDTO create(HaApiKeyCreateDTO dto, String actor) {
        validateScopes(dto.getScopes());

        String plaintext = tokenGen.generate();                          // Req 5.2
        // Never log the plaintext token (analogous to Req 3.5 for API keys).

        HaApiKey entity = new HaApiKey();
        entity.setId(UUID.randomUUID());
        entity.setName(dto.getName());
        entity.setKeyHash(encoder.encode(plaintext));                   // Req 4.5, 5.3
        entity.setKeyPrefix(plaintext.substring(0, 8));                 // Req 5.3
        entity.setScopes(String.join(",", dto.getScopes()));
        entity.setCreatedAt(Instant.now());
        entity.setExpiresAt(dto.getExpiresAt());
        entity.setCreatedBy(actor);
        // revokedAt and lastUsedAt remain null on creation

        repo.save(entity);
        log.debug("HaApiKeyService: API key created — id={}, prefix={}", entity.getId(), entity.getKeyPrefix());

        return HaApiKeyCreatedDTO.from(entity, plaintext);              // Req 5.4
    }

    /**
     * Returns all API key records as response DTOs.
     *
     * <p>The returned DTOs never contain the plaintext {@code token} or the bcrypt
     * {@code keyHash} (Requirement 5.5).
     *
     * @return list of all key records; may be empty but never {@code null}
     */
    @Transactional(readOnly = true)
    public List<HaApiKeyResponseDTO> list() {
        return repo.findAll().stream()
            .map(this::toResponse)
            .toList();
    }

    /**
     * Returns a single API key record by its UUID.
     *
     * <p>The returned DTO never contains the plaintext {@code token} or the bcrypt
     * {@code keyHash} (Requirement 5.6).
     *
     * @param id the UUID of the target record
     * @return the matching record as a response DTO
     * @throws ResponseStatusException HTTP 404 if no record with the given id exists
     */
    @Transactional(readOnly = true)
    public HaApiKeyResponseDTO get(UUID id) {
        HaApiKey entity = repo.findById(id)
            .orElseThrow(() -> new ResponseStatusException(
                HttpStatus.NOT_FOUND, "API key not found: " + id));
        return toResponse(entity);
    }

    /**
     * Revokes an API key by setting its {@code revokedAt} timestamp to the current
     * server time (Requirement 6.4).
     *
     * <p>After this call, {@link #computeStatus} will return {@link ApiKeyStatus#revoked}
     * for this record regardless of its {@code expiresAt} value.
     *
     * @param id the UUID of the key to revoke
     * @throws ResponseStatusException HTTP 404 if no record with the given id exists
     */
    @Transactional
    public void revoke(UUID id) {
        HaApiKey entity = repo.findById(id)
            .orElseThrow(() -> new ResponseStatusException(
                HttpStatus.NOT_FOUND, "API key not found: " + id));
        entity.setRevokedAt(Instant.now());                             // Req 6.4
        repo.save(entity);
        log.debug("HaApiKeyService: API key revoked — id={}", id);
    }

    // =========================================================================
    // Pure utility — exposed public static for property-based testing (Req 6.3)
    // =========================================================================

    /**
     * Computes the {@link ApiKeyStatus} from the persisted {@code revokedAt} and
     * {@code expiresAt} fields and the caller-supplied reference time.
     *
     * <p>Priority rule (Requirement 6.3):
     * <ol>
     *   <li>If {@code revokedAt} is not {@code null} → {@link ApiKeyStatus#revoked}</li>
     *   <li>Else if {@code expiresAt} is not {@code null} and
     *       {@code expiresAt.isBefore(now)} → {@link ApiKeyStatus#expired}</li>
     *   <li>Otherwise → {@link ApiKeyStatus#active}</li>
     * </ol>
     *
     * <p>This method is intentionally {@code public static} so it can be invoked
     * from property-based tests (Property 9) without constructing the full service.
     *
     * @param revokedAt server time at which the key was revoked; {@code null} if never
     *                  revoked
     * @param expiresAt optional expiry timestamp; {@code null} means no passive expiry
     * @param now       the reference instant to compare against; must not be
     *                  {@code null}
     * @return the computed status — never {@code null}
     */
    public static ApiKeyStatus computeStatus(Instant revokedAt, Instant expiresAt, Instant now) {
        if (revokedAt != null) {
            return ApiKeyStatus.revoked;
        }
        if (expiresAt != null && expiresAt.isBefore(now)) {
            return ApiKeyStatus.expired;
        }
        return ApiKeyStatus.active;
    }

    // =========================================================================
    // Private helpers
    // =========================================================================

    /**
     * Converts a {@link HaApiKey} entity to a {@link HaApiKeyResponseDTO}.
     *
     * <p>The {@code keyHash} field is intentionally excluded from the result to
     * satisfy Requirements 5.5 and 5.6. The {@code token} field does not exist in
     * this DTO at all.
     *
     * @param entity the entity to convert; must not be {@code null}
     * @return a DTO with a freshly-computed {@code status}
     */
    private HaApiKeyResponseDTO toResponse(HaApiKey entity) {
        return new HaApiKeyResponseDTO(
            entity.getId(),
            entity.getName(),
            entity.getKeyPrefix(),
            List.of(entity.getScopes().split(",")),
            computeStatus(entity.getRevokedAt(), entity.getExpiresAt(), Instant.now()),
            entity.getCreatedAt(),
            entity.getExpiresAt(),
            entity.getRevokedAt(),
            entity.getLastUsedAt()
        );
    }

    /**
     * Validates that every entry in {@code incoming} corresponds to a valid
     * {@link HaApiKeyScope} name.
     *
     * <p>Throws {@link BadRequestAlertException} with error code {@code scope.unknown}
     * on the first unrecognised scope value (Requirement 6.2). No partial writes
     * occur because this method is called before any entity construction.
     *
     * @param incoming the list of scope name strings supplied by the caller
     * @throws BadRequestAlertException if any value is not a valid
     *         {@link HaApiKeyScope} name
     */
    private void validateScopes(List<String> incoming) {
        if (incoming == null || incoming.isEmpty()) {
            throw new BadRequestAlertException(
                "At least one scope is required",
                ENTITY_NAME,
                "scope.empty"
            );
        }
        for (String s : incoming) {
            try {
                HaApiKeyScope.valueOf(s);
            } catch (IllegalArgumentException e) {
                throw new BadRequestAlertException(
                    "Unknown scope: " + s,
                    ENTITY_NAME,
                    "scope.unknown"
                );
            }
        }
    }
}
