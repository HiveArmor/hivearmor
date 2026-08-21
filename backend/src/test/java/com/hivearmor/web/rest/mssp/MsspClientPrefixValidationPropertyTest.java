package com.hivearmor.web.rest.mssp;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.multitenancy.MsspTenantResolver;
import com.hivearmor.service.mssp.DuplicatePrefixException;
import com.hivearmor.service.mssp.MsspProvisioningService;
import com.hivearmor.service.mssp.MsspTenantService;
import com.hivearmor.service.mssp.dto.NewTenantResponse;
import net.jqwik.api.*;
import net.jqwik.api.lifecycle.BeforeTry;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.filter.OncePerRequestFilter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.time.Instant;
import java.util.Collections;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/**
 * Property 4: {@code clientPrefix} bean-validation predicate is exactly
 * {@code ^[a-z0-9-]{2,20}$}.
 *
 * <p><strong>Feature: sprint-23-mssp-portal, Property 4:
 * clientPrefix bean-validation predicate is exactly ^[a-z0-9-]{2,20}$</strong>
 *
 * <p><strong>Validates: Requirements 8.5, 8.6, 10.4, 10.5</strong>
 *
 * <h2>How it works</h2>
 * <p>For any arbitrary prefix string {@code s}:
 * <ul>
 *   <li>If {@code s.matches("^[a-z0-9-]{2,20}$")} then
 *       {@code POST /api/ha-mssp/tenants} must return {@code 201} (provisioned)
 *       or {@code 409} (conflict on duplicate) — never {@code 400}.</li>
 *   <li>If {@code s} does NOT match the regex then the response must be
 *       {@code 400 Bad Request} (bean-validation failure).</li>
 * </ul>
 *
 * <p>Uses standalone {@link MockMvc} with a pre-installed {@code MSSP_ADMIN}
 * filter so that the {@code @PreAuthorize} gate is bypassed and the test focuses
 * exclusively on the {@code @Pattern} constraint on {@code NewTenantRequest}.
 *
 * <h2>Minimum iterations</h2>
 * <p>100 (enforced via {@code @Property(tries = 100)}).
 */
@Label("Feature: sprint-23-mssp-portal, Property 4: clientPrefix bean-validation predicate is exactly ^[a-z0-9-]{2,20}$")
class MsspClientPrefixValidationPropertyTest {

    /** The exact regex used by {@code @Pattern} on {@code NewTenantRequest.clientPrefix}. */
    static final String PREFIX_REGEX = "^[a-z0-9-]{2,20}$";

    private MockMvc mockMvc;
    private MsspProvisioningService provisioningService;
    private final ObjectMapper mapper = new ObjectMapper().findAndRegisterModules();

    /**
     * Auth filter that installs a static {@code MSSP_ADMIN} principal before
     * every request so the class-level {@code @PreAuthorize} does not interfere
     * with the validation assertion.
     */
    static final OncePerRequestFilter MSSP_ADMIN_FILTER = new OncePerRequestFilter() {
        @Override
        protected void doFilterInternal(HttpServletRequest req,
                                        HttpServletResponse resp,
                                        FilterChain chain)
                throws ServletException, IOException {
            SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(
                    "admin", null,
                    Collections.singletonList(new SimpleGrantedAuthority("MSSP_ADMIN"))));
            chain.doFilter(req, resp);
        }
    };

    /**
     * Re-create mocks and MockMvc before every jqwik trial so each iteration
     * starts from a clean state.
     */
    @BeforeTry
    void setUp() {
        provisioningService = mock(MsspProvisioningService.class);
        MsspTenantService tenantService = mock(MsspTenantService.class);
        MsspTenantResolver tenantResolver = mock(MsspTenantResolver.class);
        MsspTenantController controller = new MsspTenantController(provisioningService, tenantService, tenantResolver);
        mockMvc = MockMvcBuilders.standaloneSetup(controller)
            .addFilter(MSSP_ADMIN_FILTER)
            .setControllerAdvice(new MsspProblemHandler())
            .build();
    }

    // =========================================================================
    // Property 4
    // =========================================================================

    /**
     * **Validates: Requirements 8.5, 8.6, 10.4, 10.5**
     *
     * <p>For any arbitrary prefix string:
     * <ul>
     *   <li>A string matching {@code ^[a-z0-9-]{2,20}$} must yield {@code 201}
     *       (service returns a response) or {@code 409} (service throws
     *       {@link DuplicatePrefixException}) — never {@code 400}.</li>
     *   <li>A string NOT matching the regex must yield exactly {@code 400}.</li>
     * </ul>
     */
    @Property(tries = 100)
    @Label("Feature: sprint-23-mssp-portal, Property 4: valid prefix gets 201 or 409, invalid gets 400")
    void property4_prefixValidation(@ForAll("arbitraryPrefixes") String prefix) throws Exception {
        boolean valid = prefix.matches(PREFIX_REGEX);

        // For valid prefixes alternate between success and duplicate-conflict to
        // exercise both the 201 and 409 branches without a database.
        if (valid) {
            if (prefix.hashCode() % 2 == 0) {
                // Happy path: provisioning succeeds → expect 201
                when(provisioningService.provisionTenant(any()))
                    .thenReturn(new NewTenantResponse(1L, "Test Tenant", prefix, "testadmin", Instant.now()));
            } else {
                // Conflict path: prefix already exists → expect 409
                when(provisioningService.provisionTenant(any()))
                    .thenThrow(new DuplicatePrefixException(prefix));
            }
        }
        // For invalid prefixes the service is never called (400 is returned by bean-validation
        // before the controller body executes), so no stub is needed.

        Map<String, Object> body = Map.of(
            "name", "Test Tenant",
            "clientPrefix", prefix,
            "adminEmail", "admin@test.com",
            "adminLogin", "testadmin",
            "maxUsers", 10,
            "licenceType", "standard"
        );

        MvcResult result = mockMvc.perform(post("/api/ha-mssp/tenants")
                .contentType(MediaType.APPLICATION_JSON)
                .content(mapper.writeValueAsString(body)))
            .andReturn();

        int status = result.getResponse().getStatus();

        if (valid) {
            assertThat(status)
                .as("Valid prefix '%s' (matches %s) should give 201 or 409, got %d",
                    prefix, PREFIX_REGEX, status)
                .isIn(201, 409);
        } else {
            assertThat(status)
                .as("Invalid prefix '%s' (does not match %s) should give 400, got %d",
                    prefix, PREFIX_REGEX, status)
                .isEqualTo(400);
        }
    }

    // =========================================================================
    // Provider
    // =========================================================================

    /**
     * Generates a mix of valid and invalid prefix strings so that both the
     * {@code true} and {@code false} branches of the property are exercised
     * across the 100 trials.
     *
     * <p>Four sub-arbitraries are combined via {@link Arbitraries#oneOf}:
     * <ol>
     *   <li>Strings from the allowed alphabet {@code [a-z0-9-]}, length 2–20
     *       (valid by the regex).</li>
     *   <li>Strings from the allowed alphabet that are too short (0–1 chars)
     *       — invalid due to length constraint.</li>
     *   <li>Strings from the allowed alphabet that are too long (21–35 chars)
     *       — invalid due to length constraint.</li>
     *   <li>Strings with at least one uppercase letter — invalid due to
     *       character-class constraint.</li>
     *   <li>Strings containing spaces or special characters — invalid.</li>
     * </ol>
     *
     * <p>Note: sub-arbitrary (1) does NOT filter on leading/trailing hyphens
     * because the regex {@code ^[a-z0-9-]{2,20}$} does NOT exclude them — a
     * prefix of {@code "--"} is syntactically valid under the regex even though
     * it may be semantically odd. The property must reflect the regex exactly.
     */
    @Provide
    Arbitrary<String> arbitraryPrefixes() {
        return Arbitraries.oneOf(
            // (1) Valid: matches ^[a-z0-9-]{2,20}$
            Arbitraries.strings()
                .withChars("abcdefghijklmnopqrstuvwxyz0123456789-")
                .ofMinLength(2)
                .ofMaxLength(20),

            // (2) Invalid: too short (0 or 1 chars) — fails {2,20} minimum
            Arbitraries.strings()
                .withChars("abcdefghijklmnopqrstuvwxyz0123456789-")
                .ofMinLength(0)
                .ofMaxLength(1),

            // (3) Invalid: too long (21–35 chars) — fails {2,20} maximum
            Arbitraries.strings()
                .withChars("abcdefghijklmnopqrstuvwxyz0123456789-")
                .ofMinLength(21)
                .ofMaxLength(35),

            // (4) Invalid: contains at least one uppercase letter — fails [a-z0-9-]
            Arbitraries.strings()
                .withChars("ABCDEFGHIJKLMNOPQRSTUVWXYZ")
                .ofMinLength(1)
                .ofMaxLength(5)
                .flatMap(upper ->
                    Arbitraries.strings()
                        .withChars("abcdefghijklmnopqrstuvwxyz0123456789")
                        .ofMinLength(1)
                        .ofMaxLength(15)
                        .map(lower -> lower + upper)),

            // (5) Invalid: contains a space — fails [a-z0-9-]
            Arbitraries.strings()
                .withChars("abcdefghijklmnopqrstuvwxyz")
                .ofMinLength(2)
                .ofMaxLength(9)
                .map(s -> s + " suffix")
        );
    }
}
