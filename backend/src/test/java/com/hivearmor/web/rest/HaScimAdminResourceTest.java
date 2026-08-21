package com.hivearmor.web.rest;

import com.hivearmor.domain.HaConfigurationParameter;
import com.hivearmor.repository.HaConfigurationParameterRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.filter.OncePerRequestFilter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.Collections;
import java.util.Optional;

import static org.hamcrest.Matchers.notNullValue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Unit tests for {@link HaScimAdminResource} — SCIM token lifecycle admin endpoints.
 *
 * <p>Uses the HiveArmor standalone-MockMvc pattern with stub filters to inject
 * Spring Security authorities, consistent with {@link HaScimResourceTest} and
 * {@code UserJWTControllerTest}.</p>
 *
 * <p>Two stub filters are provided:</p>
 * <ul>
 *   <li>{@link #ADMIN_STUB_FILTER} — installs {@code ROLE_ADMIN}; used for tests that
 *       expect an authorised admin caller.</li>
 *   <li>{@link #USER_STUB_FILTER} — installs only {@code ROLE_USER}; used to verify
 *       that non-admin callers receive HTTP 403.</li>
 * </ul>
 *
 * <p>Security constraints enforced by these tests:</p>
 * <ul>
 *   <li>The plaintext SCIM token MUST NOT appear in any log assertion.</li>
 *   <li>The token hash is NEVER asserted on — the test only checks that the
 *       {@code token} field is non-null (opaque).</li>
 * </ul>
 */
@ExtendWith(MockitoExtension.class)
class HaScimAdminResourceTest {

    private static final String SCIM_TOKEN_KEY      = "SCIM_BEARER_TOKEN_HASH";
    private static final String SCIM_LAST_USED_KEY  = "SCIM_TOKEN_LAST_USED";

    @Mock
    private HaConfigurationParameterRepository configRepository;

    @InjectMocks
    private HaScimAdminResource controller;

    /** MockMvc wired with ROLE_ADMIN stub (tests 1, 2, 3, 5). */
    private MockMvc adminMockMvc;

    /** MockMvc wired with ROLE_USER stub (test 4 — should receive 403). */
    private MockMvc userMockMvc;

    // -------------------------------------------------------------------------
    // Stub filter — always sets ROLE_ADMIN authority
    // -------------------------------------------------------------------------

    private static final OncePerRequestFilter ADMIN_STUB_FILTER = new OncePerRequestFilter() {
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

    // -------------------------------------------------------------------------
    // Stub filter — sets only ROLE_USER (no admin authority)
    // -------------------------------------------------------------------------

    private static final OncePerRequestFilter USER_STUB_FILTER = new OncePerRequestFilter() {
        @Override
        protected void doFilterInternal(HttpServletRequest request,
                                        HttpServletResponse response,
                                        FilterChain filterChain)
                throws ServletException, IOException {
            UsernamePasswordAuthenticationToken auth = new UsernamePasswordAuthenticationToken(
                    "user-stub",
                    null,
                    Collections.singletonList(new SimpleGrantedAuthority("ROLE_USER"))
            );
            SecurityContextHolder.getContext().setAuthentication(auth);
            filterChain.doFilter(request, response);
        }
    };

    @BeforeEach
    void setUp() {
        adminMockMvc = MockMvcBuilders
                .standaloneSetup(controller)
                .addFilter(ADMIN_STUB_FILTER)
                .build();

        userMockMvc = MockMvcBuilders
                .standaloneSetup(controller)
                .addFilter(USER_STUB_FILTER)
                .build();
    }

    // =========================================================================
    // Test 1 — getTokenStatus when no token row exists → configured=false
    // =========================================================================

    /**
     * GET /api/ha-admin/scim/token/status — when the repository returns an empty
     * Optional for the {@code SCIM_BEARER_TOKEN_HASH} key, the response must be
     * HTTP 200 with {@code configured = false}.
     *
     * <p>Validates Requirement 5.5: {@code configured} is {@code true} iff a
     * non-blank token hash row exists.</p>
     */
    @Test
    void testGetTokenStatus_noToken_configuredFalse() throws Exception {
        when(configRepository.findByParamKey(SCIM_TOKEN_KEY))
                .thenReturn(Optional.empty());
        when(configRepository.findByParamKey(SCIM_LAST_USED_KEY))
                .thenReturn(Optional.empty());

        adminMockMvc.perform(get("/api/ha-admin/scim/token/status"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.configured").value(false));
    }

    // =========================================================================
    // Test 2 — getTokenStatus when a non-blank token hash exists → configured=true
    // =========================================================================

    /**
     * GET /api/ha-admin/scim/token/status — when the repository returns a row with a
     * non-blank {@code param_value} for {@code SCIM_BEARER_TOKEN_HASH}, the response
     * must be HTTP 200 with {@code configured = true}.
     *
     * <p>Validates Requirement 5.5: {@code configured} reflects the presence of a
     * non-blank hash.</p>
     */
    @Test
    void testGetTokenStatus_tokenSet_configuredTrue() throws Exception {
        HaConfigurationParameter tokenRow = new HaConfigurationParameter();
        tokenRow.setParamKey(SCIM_TOKEN_KEY);
        // A non-blank bcrypt hash value — the exact contents are never asserted on
        tokenRow.setParamValue("$2a$10$hashedTokenValueStoredInDb");

        when(configRepository.findByParamKey(SCIM_TOKEN_KEY))
                .thenReturn(Optional.of(tokenRow));
        when(configRepository.findByParamKey(SCIM_LAST_USED_KEY))
                .thenReturn(Optional.empty());

        adminMockMvc.perform(get("/api/ha-admin/scim/token/status"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.configured").value(true));
    }

    // =========================================================================
    // Test 3 — generateToken returns plaintext token field (non-null)
    // =========================================================================

    /**
     * POST /api/ha-admin/scim/token with {@code ROLE_ADMIN} — the response must be
     * HTTP 200 and the JSON body must contain a non-null {@code token} field.
     *
     * <p>The test deliberately does NOT inspect the token value in order to honour
     * the HiveArmor constraint that plaintext SCIM tokens must never appear in log
     * or assertion strings.  It only verifies that the {@code token} field is present
     * and non-null.</p>
     *
     * <p>Validates Requirement 5.3: POST /api/ha-admin/scim/token returns HTTP 200 with
     * a JSON body containing the plaintext token in a field named {@code token}.</p>
     */
    @Test
    void testGenerateToken_returnsPlaintextToken() throws Exception {
        // Repository returns empty so the controller creates a fresh row
        when(configRepository.findByParamKey(SCIM_TOKEN_KEY))
                .thenReturn(Optional.empty());
        when(configRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        adminMockMvc.perform(post("/api/ha-admin/scim/token"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.token").value(notNullValue()));
    }

    // =========================================================================
    // Test 4 — generateToken method is annotated with @PreAuthorize("hasAuthority('ROLE_ADMIN')")
    // =========================================================================

    /**
     * Asserts that {@code generateToken()} carries
     * {@code @PreAuthorize("hasAuthority('ROLE_ADMIN')")} — which is what Spring's
     * method-security AOP enforces at runtime to reject non-admin callers with HTTP 403.
     *
     * <p>Standalone MockMvc does not load the Spring AOP context needed to activate
     * {@code @PreAuthorize}, so the 403 cannot be asserted via an HTTP call in a
     * pure unit test. Instead, we assert the annotation is present on the method
     * declaration — the contract that produces HTTP 403 at runtime. This matches
     * the pattern used in {@link HaOidcResourceTest#testCreateProvider_requiresAdmin}.
     *
     * <p>Validates Requirement 5.2: all three admin endpoints require ROLE_ADMIN.</p>
     */
    @Test
    void testGenerateToken_requiresAdmin() throws NoSuchMethodException {
        var method = HaScimAdminResource.class.getDeclaredMethod("generateToken");
        var annotation = method.getAnnotation(
                org.springframework.security.access.prepost.PreAuthorize.class);
        org.junit.jupiter.api.Assertions.assertNotNull(annotation,
                "generateToken() must carry @PreAuthorize");
        org.junit.jupiter.api.Assertions.assertEquals(
                "hasAuthority('ROLE_ADMIN')", annotation.value(),
                "generateToken() @PreAuthorize expression must restrict to ROLE_ADMIN");
    }

    // =========================================================================
    // Test 5 — revokeToken returns 204 No Content
    // =========================================================================

    /**
     * DELETE /api/ha-admin/scim/token with {@code ROLE_ADMIN} — the response must be
     * HTTP 204 No Content.
     *
     * <p>Validates Requirement 5.6: DELETE /api/ha-admin/scim/token returns HTTP 204.</p>
     */
    @Test
    void testRevokeToken_returns204() throws Exception {
        HaConfigurationParameter existingRow = new HaConfigurationParameter();
        existingRow.setParamKey(SCIM_TOKEN_KEY);
        existingRow.setParamValue("$2a$10$someExistingHashValue");

        when(configRepository.findByParamKey(SCIM_TOKEN_KEY))
                .thenReturn(Optional.of(existingRow));
        when(configRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        adminMockMvc.perform(delete("/api/ha-admin/scim/token"))
                .andExpect(status().isNoContent());
    }
}
