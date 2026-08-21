package com.hivearmor.service.admin.api_key;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.hivearmor.domain.HaApiKey;
import com.hivearmor.domain.enumeration.HaApiKeyScope;
import com.hivearmor.repository.HaApiKeyRepository;
import com.hivearmor.service.dto.admin.api_key.HaApiKeyResponseDTO;
import net.jqwik.api.*;
import net.jqwik.api.constraints.IntRange;
import net.jqwik.api.lifecycle.BeforeTry;
import org.mockito.Mockito;

import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Property-based tests for {@link HaApiKeyService} GET operations.
 *
 * <p><strong>Property 7: API-key GET never exposes token or key hash</strong>
 * — Validates: Requirements 5.5, 5.6
 *
 * <p>For any {@link HaApiKey} entity, {@link HaApiKeyService#list()} and
 * {@link HaApiKeyService#get(UUID)} must return DTOs that:
 * <ul>
 *   <li>Have no {@code token} field and no {@code keyHash} field in JSON serialization.</li>
 *   <li>Have no {@code token} or {@code keyHash} fields / getter methods in the
 *       {@link HaApiKeyResponseDTO} class (verified via reflection).</li>
 * </ul>
 *
 * <p>Uses jqwik 1.8 with a minimum of 100 tries per property. No Spring context
 * is needed — collaborators are provided via Mockito mocks.
 */
class HaApiKeyGetResponsePropertyTest {

    /** Jackson mapper configured identically to Spring Boot's auto-configured mapper. */
    private ObjectMapper objectMapper;

    /** Mock repository — re-created before each trial to avoid state bleed. */
    private HaApiKeyRepository mockRepo;

    /** System under test — uses mock repo. */
    private HaApiKeyService service;

    @BeforeTry
    void setUp() {
        objectMapper = new ObjectMapper()
                .registerModule(new JavaTimeModule())
                .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);

        mockRepo = Mockito.mock(HaApiKeyRepository.class);
        // HaApiKeyTokenGenerator is injected but never called by list()/get() — null is safe.
        service = new HaApiKeyService(mockRepo, null);
    }

    // =========================================================================
    // Property 7: API-key GET never exposes token or key hash
    // Validates: Requirements 5.5, 5.6
    // =========================================================================

    /**
     * **Validates: Requirements 5.5**
     *
     * <p>For any {@link HaApiKey} entity, {@link HaApiKeyService#list()} must return
     * a list of {@link HaApiKeyResponseDTO} objects whose JSON serialization does NOT
     * contain the keys {@code "token"} or {@code "keyHash"}, regardless of the entity's
     * field values.
     *
     * <p>Additionally, the {@link HaApiKeyResponseDTO} class itself is verified via
     * reflection to have no declared {@code token} or {@code keyHash} fields or getter
     * methods, confirming the invariant is structural rather than only behavioural.
     */
    @Property(tries = 100)
    void property7_listResponseNeverExposesTokenOrKeyHash(
            @ForAll("arbitraryHaApiKeys") HaApiKey entity) throws JsonProcessingException {

        // 1. Configure mock to return the generated entity.
        Mockito.when(mockRepo.findAll()).thenReturn(List.of(entity));

        // 2. Call service.list() — must return HaApiKeyResponseDTO (never the entity).
        List<HaApiKeyResponseDTO> results = service.list();

        assertThat(results)
                .as("list() must return a non-empty list when the repo returns one entity")
                .hasSize(1);

        HaApiKeyResponseDTO dto = results.get(0);

        // 3. Serialize to JSON using Jackson ObjectMapper.
        String json = objectMapper.writeValueAsString(dto);

        // 4. Assert JSON does not contain "token" or "keyHash" as JSON field names.
        JsonNode root = objectMapper.readTree(json);
        assertThatJsonHasNoTokenOrKeyHash(root, json, "list()");

        // 5. Structural check via reflection: HaApiKeyResponseDTO must have no
        //    field or getter method named 'token' or 'keyHash'.
        assertThatResponseDtoClassHasNoTokenOrKeyHashMember();
    }

    /**
     * **Validates: Requirements 5.6**
     *
     * <p>For any {@link HaApiKey} entity, {@link HaApiKeyService#get(UUID)} must return
     * a {@link HaApiKeyResponseDTO} whose JSON serialization does NOT contain the keys
     * {@code "token"} or {@code "keyHash"}, regardless of the entity's field values.
     */
    @Property(tries = 100)
    void property7_getResponseNeverExposesTokenOrKeyHash(
            @ForAll("arbitraryHaApiKeys") HaApiKey entity) throws JsonProcessingException {

        UUID id = entity.getId();

        // 1. Configure mock to return the generated entity for the expected id.
        Mockito.when(mockRepo.findById(id)).thenReturn(Optional.of(entity));

        // 2. Call service.get(id) — must return HaApiKeyResponseDTO (never the entity).
        HaApiKeyResponseDTO dto = service.get(id);

        assertThat(dto)
                .as("get(%s) must return a non-null DTO", id)
                .isNotNull();

        // 3. Serialize to JSON using Jackson ObjectMapper.
        String json = objectMapper.writeValueAsString(dto);

        // 4. Assert JSON does not contain "token" or "keyHash" as JSON field names.
        JsonNode root = objectMapper.readTree(json);
        assertThatJsonHasNoTokenOrKeyHash(root, json, "get(" + id + ")");

        // 5. Structural check via reflection (same as in list property).
        assertThatResponseDtoClassHasNoTokenOrKeyHashMember();
    }

    // =========================================================================
    // Arbitraries (jqwik generators)
    // =========================================================================

    /**
     * Generates arbitrary {@link HaApiKey} entities with realistic field values,
     * including entities that happen to have a non-null {@code keyHash} (simulating
     * real persisted data) so that any accidental exposure path would be detected.
     *
     * <p>jqwik's {@code Combinators.combine()} supports at most 8 type parameters,
     * so the 10 fields are assembled using two nested combine stages.
     */
    @Provide
    Arbitrary<HaApiKey> arbitraryHaApiKeys() {
        Arbitrary<UUID> uuids = Arbitraries.create(UUID::randomUUID);

        Arbitrary<String> names = Arbitraries.strings()
                .withCharRange('a', 'z')
                .ofMinLength(1)
                .ofMaxLength(64);

        // Simulate a real bcrypt hash to ensure the hash is present in the entity
        // but must never appear in the GET response DTO.
        Arbitrary<String> keyHashes = Arbitraries.strings()
                .withCharRange('a', 'z')
                .ofMinLength(10)
                .ofMaxLength(60)
                .map(s -> "$2a$10$" + s);

        Arbitrary<String> keyPrefixes = Arbitraries.strings()
                .alpha()
                .ofMinLength(8)
                .ofMaxLength(8);

        Arbitrary<String> scopesCsv = Arbitraries.of(HaApiKeyScope.values())
                .list()
                .ofMinSize(1)
                .ofMaxSize(HaApiKeyScope.values().length)
                .map(list -> list.stream()
                        .map(Enum::name)
                        .distinct()
                        .collect(Collectors.joining(",")));

        long nowEpoch = Instant.now().getEpochSecond();

        Arbitrary<Instant> createdAts = Arbitraries.longs()
                .between(nowEpoch - 315_569_520L, nowEpoch - 1L)
                .map(Instant::ofEpochSecond);

        Arbitrary<Instant> nullableInstants = Arbitraries.oneOf(
                Arbitraries.just(null),
                Arbitraries.longs()
                        .between(nowEpoch - 315_569_520L, nowEpoch + 315_569_520L)
                        .map(Instant::ofEpochSecond)
        );

        Arbitrary<String> createdBys = Arbitraries.strings()
                .withCharRange('a', 'z')
                .ofMinLength(1)
                .ofMaxLength(32);

        // Stage 1: combine the first 8 fields into an intermediate HaApiKey
        // (jqwik Combinators.combine() supports at most 8 type parameters).
        Arbitrary<HaApiKey> stage1 = Combinators.combine(
                uuids, names, keyHashes, keyPrefixes,
                scopesCsv, createdAts, nullableInstants, nullableInstants
        ).as((id, name, keyHash, keyPrefix, scopes, createdAt, expiresAt, revokedAt) -> {
            HaApiKey entity = new HaApiKey();
            entity.setId(id);
            entity.setName(name);
            entity.setKeyHash(keyHash);      // must NOT appear in response DTO
            entity.setKeyPrefix(keyPrefix);
            entity.setScopes(scopes);
            entity.setCreatedAt(createdAt);
            entity.setExpiresAt(expiresAt);
            entity.setRevokedAt(revokedAt);
            return entity;
        });

        // Stage 2: combine the intermediate entity with the remaining 2 fields.
        return Combinators.combine(stage1, createdBys, nullableInstants)
                .as((entity, createdBy, lastUsedAt) -> {
                    entity.setCreatedBy(createdBy);
                    entity.setLastUsedAt(lastUsedAt);
                    return entity;
                });
    }

    // =========================================================================
    // Assertion helpers
    // =========================================================================

    /**
     * Asserts that the serialized JSON object has no field named {@code "token"}
     * or {@code "keyHash"} at the top level.
     *
     * @param root        the parsed {@link JsonNode} of the serialized DTO
     * @param rawJson     the raw JSON string (used in assertion messages)
     * @param contextDesc description of the operation under test (for error messages)
     */
    private void assertThatJsonHasNoTokenOrKeyHash(JsonNode root, String rawJson, String contextDesc) {
        assertThat(root.has("token"))
                .as("%s: JSON must NOT contain a 'token' field (Req 5.5, 5.6). "
                        + "Actual JSON: %s", contextDesc, rawJson)
                .isFalse();

        assertThat(root.has("keyHash"))
                .as("%s: JSON must NOT contain a 'keyHash' field (Req 5.5, 5.6). "
                        + "Actual JSON: %s", contextDesc, rawJson)
                .isFalse();
    }

    /**
     * Uses Java reflection to verify that {@link HaApiKeyResponseDTO} has:
     * <ul>
     *   <li>No declared {@link Field} named {@code token} or {@code keyHash}.</li>
     *   <li>No declared {@link Method} named {@code token}, {@code getToken},
     *       {@code keyHash}, or {@code getKeyHash}.</li>
     * </ul>
     *
     * <p>This structural check guarantees that the security invariant is enforced
     * at the type level, not just by serialization configuration.
     */
    private void assertThatResponseDtoClassHasNoTokenOrKeyHashMember() {
        Class<?> dtoClass = HaApiKeyResponseDTO.class;

        // --- Field-level check ---
        List<String> fieldNames = Arrays.stream(dtoClass.getDeclaredFields())
                .map(Field::getName)
                .collect(Collectors.toList());

        assertThat(fieldNames)
                .as("HaApiKeyResponseDTO must have no field named 'token' (Req 5.5, 5.6). "
                        + "Declared fields: %s", fieldNames)
                .doesNotContain("token");

        assertThat(fieldNames)
                .as("HaApiKeyResponseDTO must have no field named 'keyHash' (Req 5.5, 5.6). "
                        + "Declared fields: %s", fieldNames)
                .doesNotContain("keyHash");

        // --- Method-level check (catches getToken(), token(), etc.) ---
        List<String> methodNames = Arrays.stream(dtoClass.getDeclaredMethods())
                .map(Method::getName)
                .collect(Collectors.toList());

        assertThat(methodNames)
                .as("HaApiKeyResponseDTO must have no method named 'getToken' (Req 5.5, 5.6). "
                        + "Declared methods: %s", methodNames)
                .doesNotContain("getToken");

        assertThat(methodNames)
                .as("HaApiKeyResponseDTO must have no method named 'token' (Req 5.5, 5.6). "
                        + "Declared methods: %s", methodNames)
                .doesNotContain("token");

        assertThat(methodNames)
                .as("HaApiKeyResponseDTO must have no method named 'getKeyHash' (Req 5.5, 5.6). "
                        + "Declared methods: %s", methodNames)
                .doesNotContain("getKeyHash");

        assertThat(methodNames)
                .as("HaApiKeyResponseDTO must have no method named 'keyHash' (Req 5.5, 5.6). "
                        + "Declared methods: %s", methodNames)
                .doesNotContain("keyHash");
    }
}
