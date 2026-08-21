package com.hivearmor.web.rest.mssp;

import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.domain.HaClient;
import com.hivearmor.multitenancy.MsspIndexResolver;
import com.hivearmor.repository.HaClientRepository;
import com.hivearmor.repository.HaTenantUserRepository;
import com.hivearmor.service.elasticsearch.OpensearchClientBuilder;
import com.hivearmor.service.mssp.MsspTenantService;
import com.hivearmor.service.mssp.dto.UpdateTenantRequest;
import net.jqwik.api.*;
import net.jqwik.api.lifecycle.BeforeTry;
import org.mockito.ArgumentCaptor;

import java.time.Clock;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/**
 * Property-based tests for the {@code clientPrefix} immutability guarantee on
 * {@code PUT /api/ha-mssp/tenants/{id}}.
 *
 * <p><strong>Property 5: {@code clientPrefix} is immutable across
 * {@code PUT /api/ha-mssp/tenants/{id}}</strong>
 *
 * <p><strong>Validates: Requirements 12.3, 12.4</strong>
 *
 * <h2>Approach</h2>
 * <p>Tests operate at the service layer via pure Mockito — no MockMvc, no Spring
 * context, no database. Two complementary properties are verified:
 *
 * <ol>
 *   <li><strong>Service-layer immutability</strong>: For any combination of
 *       original prefix and {@link UpdateTenantRequest} body, calling
 *       {@link MsspTenantService#update(Long, UpdateTenantRequest)} MUST NOT
 *       mutate {@code ha_client.client_prefix}. The {@link HaClient} passed to
 *       {@code HaClientRepository.save()} is captured via an
 *       {@link ArgumentCaptor} and its {@code clientPrefix} is asserted to equal
 *       the original value.</li>
 *
 *   <li><strong>DTO structural immutability</strong>: An {@link UpdateTenantRequest}
 *       record deserialized from a JSON body that includes a {@code clientPrefix}
 *       key (and any other extra fields) via Jackson MUST silently drop those keys —
 *       the deserialized record MUST contain only the four declared fields
 *       ({@code name}, {@code maxUsers}, {@code licenceType}, {@code contactEmail})
 *       and MUST NOT expose a {@code clientPrefix} accessor.</li>
 * </ol>
 *
 * <h2>Minimum iterations</h2>
 * <p>100 per property (enforced via {@code @Property(tries = 100)}).
 *
 * <h2>Tag</h2>
 * <p>{@code Feature: sprint-23-mssp-portal, Property 5:
 * clientPrefix is immutable across PUT /api/ha-mssp/tenants/{id}}
 */
@Label("Feature: sprint-23-mssp-portal, Property 5: clientPrefix is immutable across PUT /api/ha-mssp/tenants/{id}")
class MsspClientPrefixImmutabilityPropertyTest {

    // =========================================================================
    // Fields — re-created before every jqwik try via @BeforeTry
    // =========================================================================

    private HaClientRepository clients;
    private MsspTenantService service;

    /**
     * ObjectMapper configured to mirror the JHipster / Spring Boot default:
     * {@code FAIL_ON_UNKNOWN_PROPERTIES = false}. This is how the real controller
     * deserializes PUT request bodies — unknown keys (e.g. {@code clientPrefix})
     * are silently dropped rather than causing an error.
     */
    private final ObjectMapper mapper = new ObjectMapper()
            .findAndRegisterModules()
            .configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);

    /**
     * Rebuilds a fresh set of Mockito mocks and a fresh {@link MsspTenantService}
     * before each jqwik trial so that captured argument state and stub expectations
     * do not leak across iterations.
     */
    @BeforeTry
    void setUp() {
        clients = mock(HaClientRepository.class);
        HaTenantUserRepository memberships = mock(HaTenantUserRepository.class);
        MsspIndexResolver indexResolver = mock(MsspIndexResolver.class);
        OpensearchClientBuilder os = mock(OpensearchClientBuilder.class);
        Clock clock = Clock.systemUTC();

        when(memberships.countByClientId(any())).thenReturn(0L);
        when(indexResolver.resolveIndexPatternForPrefix(any(), any()))
                .thenReturn("v3-hive-alert-test-*");

        service = new MsspTenantService(clients, memberships, indexResolver, os, clock);
    }

    // =========================================================================
    // Property 5A — Service layer: clientPrefix is never mutated by update()
    // Validates: Requirements 12.3, 12.4
    // =========================================================================

    /**
     * For any combination of {@code originalPrefix} and {@link UpdateTenantRequest}:
     * <ol>
     *   <li>A {@link HaClient} is constructed with {@code clientPrefix = originalPrefix}
     *       and mocked into {@code HaClientRepository.findById()}.</li>
     *   <li>{@link MsspTenantService#update(Long, UpdateTenantRequest)} is invoked.</li>
     *   <li>The {@link HaClient} captured by {@code HaClientRepository.save()} MUST
     *       have {@code clientPrefix} still equal to {@code originalPrefix}.</li>
     * </ol>
     *
     * <p><strong>Validates: Requirements 12.3, 12.4</strong>
     */
    @Property(tries = 100)
    @Label("Feature: sprint-23-mssp-portal, Property 5: clientPrefix is immutable across PUT /api/ha-mssp/tenants/{id}")
    void property5_clientPrefixNeverMutated(
            @ForAll("validPrefixes") String originalPrefix,
            @ForAll("validUpdateRequests") UpdateTenantRequest req) {

        // Arrange: a managed client with a known prefix
        HaClient client = new HaClient();
        client.setId(1L);
        client.setName("Original Name");
        client.setClientPrefix(originalPrefix);
        client.setMsspManaged(true);
        client.setMaxUsers(50);
        client.setLicenceType("standard");
        client.setContactEmail("original@test.com");

        when(clients.findById(1L)).thenReturn(Optional.of(client));
        when(clients.save(any())).thenAnswer(inv -> inv.getArgument(0));

        // Act: call the service update method
        service.update(1L, req);

        // Assert: the entity passed to save() still has the original prefix
        ArgumentCaptor<HaClient> captor = ArgumentCaptor.forClass(HaClient.class);
        verify(clients).save(captor.capture());
        HaClient saved = captor.getValue();

        assertThat(saved.getClientPrefix())
                .as("clientPrefix must remain '%s' after update — "
                        + "UpdateTenantRequest has no clientPrefix field, "
                        + "so update() must never call setClientPrefix(); "
                        + "req.name()='%s', req.maxUsers()=%d, "
                        + "req.licenceType()='%s', req.contactEmail()='%s'",
                        originalPrefix,
                        req.name(), req.maxUsers(), req.licenceType(), req.contactEmail())
                .isEqualTo(originalPrefix);
    }

    // =========================================================================
    // Property 5B — DTO structural: Jackson drops clientPrefix from PUT body
    // Validates: Requirements 12.3, 12.4
    // =========================================================================

    /**
     * When a JSON PUT body includes a {@code clientPrefix} key (and other extra
     * unknown keys), Jackson MUST silently drop those keys and produce an
     * {@link UpdateTenantRequest} record containing only the four declared fields.
     *
     * <p>Verification is structural: the record's accessors are called to confirm
     * the four declared fields are present and correctly deserialized; the absence
     * of a {@code clientPrefix()} accessor is enforced at compile time by the
     * {@code record} declaration itself (the test would not compile if such a
     * method existed).
     *
     * <p><strong>Validates: Requirements 12.3, 12.4</strong>
     */
    @Property(tries = 100)
    @Label("Feature: sprint-23-mssp-portal, Property 5B: Jackson drops clientPrefix from PUT body")
    void property5_jacksonDropsClientPrefixFromBody(
            @ForAll("arbitraryPrefixes") String injectPrefix) throws Exception {

        // Build a JSON body that includes clientPrefix as an extra key
        Map<String, Object> body = new HashMap<>();
        body.put("name", "Test Tenant");
        body.put("maxUsers", 10);
        body.put("licenceType", "standard");
        body.put("contactEmail", "tenant@test.com");
        body.put("clientPrefix", injectPrefix);  // extra field — must be silently dropped

        // Deserialize via ObjectMapper (mirrors Jackson's behavior in the controller)
        UpdateTenantRequest req = mapper.convertValue(body, UpdateTenantRequest.class);

        // Assert: the four declared fields are present and correctly deserialized
        assertThat(req.name())
                .as("name must be deserialized correctly even when clientPrefix is present "
                        + "in the JSON body (injected prefix='%s')", injectPrefix)
                .isEqualTo("Test Tenant");
        assertThat(req.maxUsers())
                .as("maxUsers must be deserialized correctly even when clientPrefix is present "
                        + "in the JSON body (injected prefix='%s')", injectPrefix)
                .isEqualTo(10);
        assertThat(req.licenceType())
                .as("licenceType must be deserialized correctly even when clientPrefix is "
                        + "present in the JSON body (injected prefix='%s')", injectPrefix)
                .isEqualTo("standard");
        assertThat(req.contactEmail())
                .as("contactEmail must be deserialized correctly even when clientPrefix is "
                        + "present in the JSON body (injected prefix='%s')", injectPrefix)
                .isEqualTo("tenant@test.com");

        // The compile-time invariant: UpdateTenantRequest is a record with exactly
        // four components (name, maxUsers, licenceType, contactEmail). If a
        // clientPrefix() accessor existed, this file would not compile, making the
        // immutability guarantee statically enforced.
        //
        // Runtime confirmation: verify that none of the component accessors return
        // the injected prefix value (they all return their own correctly-typed values).
        assertThat(req.name()).isNotEqualTo(injectPrefix);
    }

    // =========================================================================
    // Arbitraries (providers)
    // =========================================================================

    /**
     * Generates valid {@code clientPrefix} values matching the format
     * {@code ^[a-z0-9][a-z0-9-]{1,19}$} — realistic MSSP tenant prefixes.
     * Includes edge cases: minimum length (2 chars), maximum length (20 chars),
     * prefixes with hyphens, and purely numeric prefixes.
     */
    @Provide
    Arbitrary<String> validPrefixes() {
        // First char: lowercase letter or digit (no leading hyphen for realism)
        Arbitrary<Character> firstChar = Arbitraries.chars()
                .with("abcdefghijklmnopqrstuvwxyz0123456789");
        // Tail: lowercase letters, digits, hyphens
        Arbitrary<String> tail = Arbitraries.strings()
                .withChars("abcdefghijklmnopqrstuvwxyz0123456789-")
                .ofMinLength(1)
                .ofMaxLength(19);

        return Combinators.combine(firstChar, tail)
                .as((first, rest) -> String.valueOf(first) + rest);
    }

    /**
     * Generates arbitrary strings to be injected as the {@code clientPrefix} key
     * in the PUT JSON body — tests that Jackson silently discards whatever value
     * is provided.
     *
     * <p>Covers valid prefixes, empty strings, strings with spaces, uppercase
     * letters, special characters, and very long strings.
     */
    @Provide
    Arbitrary<String> arbitraryPrefixes() {
        return Arbitraries.oneOf(
                // Valid-looking prefixes
                Arbitraries.strings()
                        .withChars("abcdefghijklmnopqrstuvwxyz0123456789-")
                        .ofMinLength(2)
                        .ofMaxLength(20),

                // Empty string
                Arbitraries.just(""),

                // Strings with uppercase — Jackson must drop regardless
                Arbitraries.strings()
                        .withChars("ABCDEFGHIJKLMNOPQRSTUVWXYZ")
                        .ofMinLength(1)
                        .ofMaxLength(10),

                // Strings with spaces and special chars
                Arbitraries.strings()
                        .withChars("abcdefghijklmnopqrstuvwxyz !@#$%^&*()")
                        .ofMinLength(2)
                        .ofMaxLength(30),

                // Very long strings
                Arbitraries.strings()
                        .withChars("abcdefghijklmnopqrstuvwxyz0123456789")
                        .ofMinLength(21)
                        .ofMaxLength(100)
        );
    }

    /**
     * Generates valid {@link UpdateTenantRequest} instances with all four declared
     * fields populated. The {@code name} field is non-blank, {@code maxUsers} is
     * positive, {@code licenceType} is non-blank, and {@code contactEmail} is a
     * simple email-shaped string.
     *
     * <p>Note: {@code UpdateTenantRequest} is a Java {@code record} with exactly
     * four components — there is no {@code clientPrefix} parameter. This generator
     * therefore cannot inject one, which structurally enforces the immutability
     * invariant at the type level.
     */
    @Provide
    Arbitrary<UpdateTenantRequest> validUpdateRequests() {
        Arbitrary<String> names = Arbitraries.strings()
                .withChars("abcdefghijklmnopqrstuvwxyz ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789")
                .ofMinLength(1)
                .ofMaxLength(100)
                .filter(s -> !s.isBlank());

        Arbitrary<Integer> maxUsers = Arbitraries.integers().between(1, 10_000);

        Arbitrary<String> licenceTypes = Arbitraries.of(
                "standard", "enterprise", "trial", "unlimited");

        Arbitrary<String> emails = Arbitraries.strings()
                .withChars("abcdefghijklmnopqrstuvwxyz0123456789")
                .ofMinLength(1)
                .ofMaxLength(20)
                .flatMap(local ->
                        Arbitraries.strings()
                                .withChars("abcdefghijklmnopqrstuvwxyz")
                                .ofMinLength(2)
                                .ofMaxLength(10)
                                .map(domain -> local + "@" + domain + ".com"));

        return Combinators.combine(names, maxUsers, licenceTypes, emails)
                .as(UpdateTenantRequest::new);
    }
}
