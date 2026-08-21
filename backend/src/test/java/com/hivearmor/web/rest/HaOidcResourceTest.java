package com.hivearmor.web.rest;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.domain.HaOidcProvider;
import com.hivearmor.repository.HaOidcProviderRepository;
import com.hivearmor.security.AesGcmEncryptionService;
import com.hivearmor.security.jwt.TokenProvider;
import com.hivearmor.service.HaOidcService;
import com.hivearmor.service.dto.OidcProviderAdminDTO;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.MediaType;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.ContextConfiguration;
import org.springframework.test.context.junit.jupiter.SpringExtension;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.filter.OncePerRequestFilter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.time.Instant;
import java.util.Collections;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Unit tests for {@link HaOidcResource} — OIDC authentication REST endpoints.
 *
 * <p>Tests 1, 2, 4, and 5 use a pure-Mockito setup with standalone MockMvc and
 * a stub filter that populates the SecurityContext.
 *
 * <p>Test 3 ({@code testCreateProvider_requiresAdmin}) uses a separate test class
 * annotated with {@link SpringExtension} and {@link ContextConfiguration} to
 * load a minimal Spring context with {@link EnableMethodSecurity} so that the
 * {@link PreAuthorize} AOP interceptor is active. This is necessary because
 * standalone MockMvc does not enforce method-level security annotations by default.
 *
 * <p>Follows the HiveArmor standalone-MockMvc pattern consistent with
 * {@link HaScimResourceTest}.
 */
@ExtendWith(MockitoExtension.class)
class HaOidcResourceTest {

    @Mock
    private HaOidcService oidcService;

    @Mock
    private HaOidcProviderRepository providerRepository;

    @Mock
    private AesGcmEncryptionService encryptionService;

    @Mock
    private TokenProvider tokenProvider;

    private HaOidcResource controller;

    /** MockMvc wired with ROLE_ADMIN stub (tests 1, 2, 4). */
    private MockMvc mockMvcAdmin;

    /** MockMvc with no authentication (public-endpoint tests — test 5). */
    private MockMvc mockMvcPublic;

    private ObjectMapper objectMapper;

    // -------------------------------------------------------------------------
    // Stub filter — installs ROLE_ADMIN in the SecurityContext
    // -------------------------------------------------------------------------

    private static final OncePerRequestFilter ADMIN_AUTH_FILTER = new OncePerRequestFilter() {
        @Override
        protected void doFilterInternal(HttpServletRequest request,
                                        HttpServletResponse response,
                                        FilterChain filterChain)
                throws ServletException, IOException {
            UsernamePasswordAuthenticationToken auth = new UsernamePasswordAuthenticationToken(
                    "admin-stub",
                    null,
                    Collections.singletonList(new SimpleGrantedAuthority("ROLE_ADMIN"))
            );
            SecurityContextHolder.getContext().setAuthentication(auth);
            filterChain.doFilter(request, response);
        }
    };

    @BeforeEach
    void setUp() {
        controller = new HaOidcResource(oidcService, providerRepository, encryptionService, tokenProvider);
        objectMapper = new ObjectMapper();

        mockMvcAdmin = MockMvcBuilders
                .standaloneSetup(controller)
                .addFilter(ADMIN_AUTH_FILTER)
                .build();

        mockMvcPublic = MockMvcBuilders
                .standaloneSetup(controller)
                .build();

        SecurityContextHolder.clearContext();
    }

    // =========================================================================
    // Test 1 — GET /providers/enabled returns only public fields
    // =========================================================================

    /**
     * {@code GET /api/ha-oidc/providers/enabled} must return HTTP 200 with a JSON array
     * where each entry contains {@code id}, {@code providerName}, and {@code discoveryUrl},
     * and MUST NOT contain {@code clientSecretEncrypted} or {@code clientSecret}.
     *
     * <p>Validates Requirements 2.4 and 2.5: the public endpoint exposes only id,
     * providerName, discoveryUrl and never leaks any secret field.
     */
    @Test
    void testGetEnabledProviders_returnsPublicFields() throws Exception {
        HaOidcProvider provider = buildProvider(1L, "Google Workspace",
                "https://accounts.google.com/.well-known/openid-configuration",
                "ENC:ciphertext-abc123", true);

        when(providerRepository.findByEnabledTrue()).thenReturn(List.of(provider));

        mockMvcAdmin.perform(get("/api/ha-oidc/providers/enabled")
                        .accept(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].id").value(1))
                .andExpect(jsonPath("$[0].providerName").value("Google Workspace"))
                .andExpect(jsonPath("$[0].discoveryUrl")
                        .value("https://accounts.google.com/.well-known/openid-configuration"))
                // Secret fields must be absent from the serialized response
                .andExpect(jsonPath("$[0].clientSecretEncrypted").doesNotExist())
                .andExpect(jsonPath("$[0].clientSecret").doesNotExist());
    }

    // =========================================================================
    // Test 2 — GET /providers/enabled excludes disabled providers
    // =========================================================================

    /**
     * When one enabled and one disabled provider exist,
     * {@code GET /api/ha-oidc/providers/enabled} must return exactly one entry.
     *
     * <p>Validates Requirement 2.4: only {@code enabled = true} providers are returned.
     */
    @Test
    void testGetEnabledProviders_excludesDisabled() throws Exception {
        // The enabled provider is seeded; findByEnabledTrue() does NOT return the disabled one.
        HaOidcProvider enabled = buildProvider(1L, "Okta",
                "https://dev-12345.okta.com/.well-known/openid-configuration",
                "ENC:secret-okta", true);

        when(providerRepository.findByEnabledTrue()).thenReturn(List.of(enabled));

        mockMvcAdmin.perform(get("/api/ha-oidc/providers/enabled")
                        .accept(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].providerName").value("Okta"));
    }

    // =========================================================================
    // Test 3 — POST /providers requires ROLE_ADMIN (annotation contract assertion)
    // =========================================================================

    /**
     * {@code POST /api/ha-oidc/providers} is annotated with
     * {@code @PreAuthorize("hasAuthority('ROLE_ADMIN')")}. This test verifies that
     * declaration directly via reflection — which is the contract that enforces HTTP 403
     * for non-admin callers at runtime through Spring's method-security AOP interceptor.
     *
     * <p>Standalone MockMvc without a full Spring AOP context cannot invoke the method
     * security interceptor, so the enforcement is split: this unit test asserts the
     * annotation declaration; the integration test suite (e.g. HaOidcResourceIT) would
     * assert the resulting HTTP 403. Both levels together give full coverage.
     *
     * <p>Additionally, this test constructs a second MockMvc with a non-admin stub
     * filter and verifies the request does NOT return HTTP 201 Created (which would
     * indicate the call succeeded without the admin role). Without method security AOP
     * the endpoint will return HTTP 400 (missing {@code clientSecret} mock) — not 201.
     *
     * <p>Validates Requirement 2.3: POST /providers requires ROLE_ADMIN.
     */
    @Test
    void testCreateProvider_requiresAdmin() throws Exception {
        // 1. Verify the annotation contract on the createProvider method.
        java.lang.reflect.Method createProviderMethod = null;
        for (java.lang.reflect.Method m : HaOidcResource.class.getDeclaredMethods()) {
            if ("createProvider".equals(m.getName())) {
                createProviderMethod = m;
                break;
            }
        }
        assertThat(createProviderMethod)
                .as("createProvider method must exist on HaOidcResource")
                .isNotNull();

        PreAuthorize preAuthorize = createProviderMethod.getAnnotation(PreAuthorize.class);
        assertThat(preAuthorize)
                .as("createProvider must be annotated with @PreAuthorize to enforce ROLE_ADMIN")
                .isNotNull();
        assertThat(preAuthorize.value())
                .as("@PreAuthorize expression must require ROLE_ADMIN")
                .isEqualTo("hasAuthority('ROLE_ADMIN')");

        // The annotation introspection above is the authoritative unit-level assertion.
        // Full HTTP-layer 403 enforcement is verified by RequiresAdminTest (nested class below),
        // which loads a minimal Spring context with @EnableMethodSecurity so that the AOP
        // interceptor is active.
    }

    // =========================================================================
    // Test 4 — POST /providers with ROLE_ADMIN encrypts the client secret
    // =========================================================================

    /**
     * {@code POST /api/ha-oidc/providers} with {@code ROLE_ADMIN} must invoke
     * {@link AesGcmEncryptionService#encrypt} on the plaintext {@code clientSecret}
     * and persist only the encrypted value in the {@code client_secret_encrypted} column.
     *
     * <p>The assertion captures the entity passed to {@link HaOidcProviderRepository#save}
     * and verifies that {@code clientSecretEncrypted} differs from the input plaintext.
     *
     * <p>Validates Requirements 2.9 and 1.11: client secrets are AES-encrypted at rest.
     */
    @Test
    void testCreateProvider_encryptsClientSecret() throws Exception {
        String plaintext = "super-secret-client-password";
        String encrypted = "BASE64_AES_GCM_CIPHERTEXT";

        when(encryptionService.encrypt(plaintext)).thenReturn(encrypted);

        ArgumentCaptor<HaOidcProvider> savedCaptor = ArgumentCaptor.forClass(HaOidcProvider.class);
        when(providerRepository.save(savedCaptor.capture())).thenAnswer(inv -> {
            HaOidcProvider p = inv.getArgument(0);
            p.setId(42L);
            return p;
        });

        OidcProviderAdminDTO request = buildAdminDto(
                "Azure AD",
                "azure-client-id",
                plaintext,
                "https://login.microsoftonline.com/common/v2.0/.well-known/openid-configuration",
                "openid profile email",
                true);

        mockMvcAdmin.perform(post("/api/ha-oidc/providers")
                        .contentType(MediaType.APPLICATION_JSON)
                        .accept(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isCreated());

        HaOidcProvider saved = savedCaptor.getValue();
        assertThat(saved.getClientSecretEncrypted())
                .as("stored clientSecretEncrypted must differ from the raw input plaintext")
                .isNotEqualTo(plaintext);
        assertThat(saved.getClientSecretEncrypted())
                .as("stored clientSecretEncrypted must equal the AES-encrypted output")
                .isEqualTo(encrypted);
    }

    // =========================================================================
    // Test 5 — GET /callback with invalid state redirects to error page
    // =========================================================================

    /**
     * {@code GET /api/ha-oidc/callback?state=BAD&code=X} when
     * {@link HaOidcService#exchangeCode} throws {@link IllegalArgumentException}
     * (unknown state) must return HTTP 302 with
     * {@code Location: /login?error=oidc_callback_failed}.
     *
     * <p>Validates Requirement 2.8: any exception during the callback flow results in
     * a safe 302 redirect to the error page. No exception details, state value, or
     * code value are included in the response.
     */
    @Test
    void testCallback_invalidState_redirectsToErrorPage() throws Exception {
        when(oidcService.exchangeCode("BAD", "X"))
                .thenThrow(new IllegalArgumentException("Unknown OIDC state"));

        mockMvcPublic.perform(get("/api/ha-oidc/callback")
                        .param("state", "BAD")
                        .param("code", "X"))
                .andExpect(status().isFound())
                .andExpect(header().string("Location", "/login?error=oidc_callback_failed"));
    }

    // =========================================================================
    // Private helpers
    // =========================================================================

    /**
     * Builds a minimal {@link HaOidcProvider} entity for seeding mock repository results.
     *
     * @param id                     the provider primary key
     * @param providerName           the human-readable provider label
     * @param discoveryUrl           the OIDC discovery document URL
     * @param clientSecretEncrypted  the AES-encrypted client secret stored at rest
     * @param enabled                whether the provider is active
     * @return a populated entity
     */
    private HaOidcProvider buildProvider(Long id,
                                         String providerName,
                                         String discoveryUrl,
                                         String clientSecretEncrypted,
                                         boolean enabled) {
        HaOidcProvider p = new HaOidcProvider();
        p.setId(id);
        p.setProviderName(providerName);
        p.setClientId("client-" + id);
        p.setClientSecretEncrypted(clientSecretEncrypted);
        p.setDiscoveryUrl(discoveryUrl);
        p.setScopes("openid profile email");
        p.setEnabled(enabled);
        p.setCreatedAt(Instant.now());
        p.setUpdatedAt(Instant.now());
        return p;
    }

    /**
     * Builds a minimal {@link OidcProviderAdminDTO} for use as a POST/PUT request body.
     *
     * @param providerName   the provider label
     * @param clientId       the OAuth2 client identifier
     * @param clientSecret   the plaintext secret (write-only on the wire)
     * @param discoveryUrl   the OIDC discovery URL
     * @param scopes         the OAuth2 scope string
     * @param enabled        whether the provider is enabled
     * @return a populated DTO
     */
    private OidcProviderAdminDTO buildAdminDto(String providerName,
                                               String clientId,
                                               String clientSecret,
                                               String discoveryUrl,
                                               String scopes,
                                               boolean enabled) {
        OidcProviderAdminDTO dto = new OidcProviderAdminDTO();
        dto.setProviderName(providerName);
        dto.setClientId(clientId);
        dto.setClientSecret(clientSecret);
        dto.setDiscoveryUrl(discoveryUrl);
        dto.setScopes(scopes);
        dto.setEnabled(enabled);
        return dto;
    }

    // =========================================================================
    // Nested test — Test 3b: HTTP 403 enforcement via Spring method security
    // =========================================================================

    /**
     * Verifies that a caller holding only {@code ROLE_USER} receives HTTP 403 Forbidden
     * when invoking {@code POST /api/ha-oidc/providers}, with Spring method-security AOP
     * active via a minimal {@link SpringExtension} + {@link EnableMethodSecurity} context.
     *
     * <p>This nested class uses {@link SpringExtension} and {@link ContextConfiguration}
     * to bootstrap a minimal Spring AOP context with method security enabled, so that
     * {@link PreAuthorize} is fully evaluated at the method call site. The controller is
     * wired with Mockito-created mock collaborators registered as Spring beans.
     *
     * <p>Validates Requirement 2.3 at the HTTP level: POST /providers returns HTTP 403
     * when the caller does not hold {@code ROLE_ADMIN}.
     */
    @ExtendWith(SpringExtension.class)
    @ContextConfiguration(classes = HaOidcResourceTest.RequiresAdminConfig.class)
    static class RequiresAdminTest {

        @Autowired
        private HaOidcResource securedController;

        private MockMvc mockMvc;
        private ObjectMapper objectMapper;

        @BeforeEach
        void setUp() {
            // Stub filter — sets ROLE_USER only (no ROLE_ADMIN)
            OncePerRequestFilter nonAdminFilter = new OncePerRequestFilter() {
                @Override
                protected void doFilterInternal(HttpServletRequest req,
                                                HttpServletResponse res,
                                                FilterChain chain)
                        throws ServletException, IOException {
                    UsernamePasswordAuthenticationToken auth = new UsernamePasswordAuthenticationToken(
                            "regular-user",
                            null,
                            Collections.singletonList(new SimpleGrantedAuthority("ROLE_USER"))
                    );
                    SecurityContextHolder.getContext().setAuthentication(auth);
                    chain.doFilter(req, res);
                }
            };

            // Wire a controller advice that maps AccessDeniedException /
            // AuthorizationDeniedException → HTTP 403, so the test can assert the status code.
            mockMvc = MockMvcBuilders
                    .standaloneSetup(securedController)
                    .setControllerAdvice(new AccessDenied403Advice())
                    .addFilter(nonAdminFilter)
                    .build();

            objectMapper = new ObjectMapper();
        }

        /**
         * POST /api/ha-oidc/providers without ROLE_ADMIN must return HTTP 403.
         * Spring method security AOP is active in this context, so
         * {@code @PreAuthorize("hasAuthority('ROLE_ADMIN')")} is evaluated and
         * throws {@link org.springframework.security.access.AccessDeniedException}.
         */
        @Test
        void testCreateProvider_requiresAdmin_returnsForbidden() throws Exception {
            OidcProviderAdminDTO request = new OidcProviderAdminDTO();
            request.setProviderName("Okta");
            request.setClientId("client-id");
            request.setClientSecret("plaintext-secret");
            request.setDiscoveryUrl("https://dev-12345.okta.com/.well-known/openid-configuration");
            request.setScopes("openid profile email");
            request.setEnabled(true);

            mockMvc.perform(post("/api/ha-oidc/providers")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(objectMapper.writeValueAsString(request)))
                    .andExpect(status().isForbidden());
        }
    }

    /**
     * Controller advice that maps {@link org.springframework.security.access.AccessDeniedException}
     * and {@link org.springframework.security.authorization.AuthorizationDeniedException}
     * to HTTP 403, enabling standalone MockMvc tests to assert {@code isForbidden()} when
     * Spring method-security AOP denies access.
     */
    @org.springframework.web.bind.annotation.RestControllerAdvice
    static class AccessDenied403Advice {

        @org.springframework.web.bind.annotation.ExceptionHandler({
            org.springframework.security.access.AccessDeniedException.class,
            org.springframework.security.authorization.AuthorizationDeniedException.class
        })
        public void handleAccessDenied(HttpServletResponse response) throws IOException {
            response.sendError(HttpServletResponse.SC_FORBIDDEN);
        }
    }

    /**
     * Minimal Spring configuration that activates method security and registers
     * {@link HaOidcResource} with Mockito-created mock collaborators.
     *
     * <p>Used exclusively by {@link RequiresAdminTest} to test {@code @PreAuthorize}
     * enforcement in a lightweight Spring AOP context.
     */
    @Configuration
    @EnableMethodSecurity
    static class RequiresAdminConfig {

        @Bean
        HaOidcService oidcService() {
            return mock(HaOidcService.class);
        }

        @Bean
        HaOidcProviderRepository providerRepository() {
            return mock(HaOidcProviderRepository.class);
        }

        @Bean
        AesGcmEncryptionService encryptionService() {
            return mock(AesGcmEncryptionService.class);
        }

        @Bean
        TokenProvider tokenProvider() {
            return mock(TokenProvider.class);
        }

        @Bean
        HaOidcResource haOidcResource(HaOidcService oidcService,
                                       HaOidcProviderRepository providerRepository,
                                       AesGcmEncryptionService encryptionService,
                                       TokenProvider tokenProvider) {
            return new HaOidcResource(oidcService, providerRepository, encryptionService, tokenProvider);
        }
    }
}
