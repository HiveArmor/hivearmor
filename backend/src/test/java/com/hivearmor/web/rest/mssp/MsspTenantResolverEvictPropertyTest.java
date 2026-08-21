package com.hivearmor.web.rest.mssp;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.multitenancy.MsspTenantResolver;
import com.hivearmor.service.mssp.MsspProvisioningService;
import com.hivearmor.service.mssp.MsspTenantService;
import com.hivearmor.service.mssp.dto.TenantDetailDTO;
import com.hivearmor.service.mssp.dto.UpdateTenantRequest;
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
import java.util.Collections;
import java.util.Map;

import org.mockito.InOrder;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;

/**
 * Property 6: {@link MsspTenantResolver#evict(Long)} is invoked exactly once per
 * successful {@code PUT /api/ha-mssp/tenants/{id}}, regardless of whether the evict
 * call itself succeeds or throws.
 *
 * <p><strong>Feature: sprint-23-mssp-portal,
 * Property 6: MsspTenantResolver.evict(id) is invoked exactly once per successful PUT</strong>
 *
 * <p><strong>Validates: Requirements 12.5, 12.6</strong>
 *
 * <h2>How it works</h2>
 * <p>For any arbitrary {@code (id, UpdateTenantRequest)} pair:
 *
 * <ul>
 *   <li><strong>Case A — evict succeeds:</strong> mock {@code tenantService.update(id, any())}
 *       to return a valid {@link TenantDetailDTO}, mock {@code tenantResolver.evict(id)} to
 *       do nothing, submit {@code PUT /api/ha-mssp/tenants/{id}}, assert status {@code 200},
 *       verify {@code tenantResolver.evict(id)} was called exactly once, and verify ordering
 *       via {@code InOrder} that {@code tenantService.update} happened before
 *       {@code tenantResolver.evict}.</li>
 *   <li><strong>Case B — evict throws:</strong> mock {@code tenantService.update(id, any())}
 *       to return the same {@link TenantDetailDTO}, mock {@code tenantResolver.evict(id)} to
 *       throw {@code RuntimeException("evict failed")}, submit {@code PUT}, assert status is
 *       still {@code 200} (evict failure must NOT fail the request), verify
 *       {@code tenantResolver.evict(id)} was still called exactly once, and verify the response
 *       body equals the DTO returned by the service.</li>
 * </ul>
 *
 * <h2>Minimum iterations</h2>
 * <p>100 (enforced via {@code @Property(tries = 100)}).
 */
@Label("Feature: sprint-23-mssp-portal, Property 6: MsspTenantResolver.evict(id) is invoked exactly once per successful PUT")
class MsspTenantResolverEvictPropertyTest {

    private MockMvc mockMvc;
    private MsspTenantService tenantService;
    private MsspProvisioningService provisioningService;
    private MsspTenantResolver tenantResolver;
    private MsspTenantController controller;
    private final ObjectMapper mapper = new ObjectMapper().findAndRegisterModules();

    /**
     * Auth filter that installs a static {@code MSSP_ADMIN} principal before
     * every request so the class-level {@code @PreAuthorize} does not interfere
     * with the evict-ordering assertion.
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
     * starts from a clean Mockito state.
     */
    @BeforeTry
    void setUp() {
        tenantService = mock(MsspTenantService.class);
        provisioningService = mock(MsspProvisioningService.class);
        tenantResolver = mock(MsspTenantResolver.class);
        controller = new MsspTenantController(provisioningService, tenantService, tenantResolver);
        mockMvc = MockMvcBuilders.standaloneSetup(controller)
            .addFilter(MSSP_ADMIN_FILTER)
            .setControllerAdvice(new MsspProblemHandler())
            .build();
    }

    // =========================================================================
    // Property 6
    // =========================================================================

    /**
     * **Validates: Requirements 12.5, 12.6**
     *
     * <p>For any arbitrary {@code (id, UpdateTenantRequest)}:
     * <ul>
     *   <li>Case A: when evict succeeds, the response is {@code 200} and
     *       {@code tenantResolver.evict(id)} is called exactly once, strictly
     *       after {@code tenantService.update(id, any())}.</li>
     *   <li>Case B: when evict throws, the response is still {@code 200},
     *       {@code tenantResolver.evict(id)} is still called exactly once, and
     *       the response body matches the DTO returned by the service.</li>
     * </ul>
     */
    @Property(tries = 100)
    @Label("Feature: sprint-23-mssp-portal, Property 6: MsspTenantResolver.evict(id) is invoked exactly once per successful PUT")
    void property6_evictCalledExactlyOnce(
            @ForAll("validIds") Long id,
            @ForAll("validUpdateRequests") UpdateTenantRequest req) throws Exception {

        TenantDetailDTO dto = buildTenantDetailDTO(id, req);

        // ----------------------------------------------------------------
        // Case A: evict succeeds
        // ----------------------------------------------------------------
        when(tenantService.update(eq(id), any())).thenReturn(dto);
        doNothing().when(tenantResolver).evict(id);

        MvcResult resultA = mockMvc.perform(put("/api/ha-mssp/tenants/{id}", id)
                .contentType(MediaType.APPLICATION_JSON)
                .content(mapper.writeValueAsString(buildRequestBody(req))))
            .andReturn();

        assertThat(resultA.getResponse().getStatus())
            .as("Case A: PUT /api/ha-mssp/tenants/%d should return 200 when evict succeeds", id)
            .isEqualTo(200);

        // verify evict called exactly once
        verify(tenantResolver, times(1)).evict(id);

        // verify ordering: update BEFORE evict
        InOrder order = inOrder(tenantService, tenantResolver);
        order.verify(tenantService).update(eq(id), any());
        order.verify(tenantResolver).evict(id);

        // ----------------------------------------------------------------
        // Case B: evict throws — reset mocks, re-verify
        // ----------------------------------------------------------------
        reset(tenantService, tenantResolver);
        when(tenantService.update(eq(id), any())).thenReturn(dto);
        doThrow(new RuntimeException("evict failed")).when(tenantResolver).evict(id);

        MvcResult resultB = mockMvc.perform(put("/api/ha-mssp/tenants/{id}", id)
                .contentType(MediaType.APPLICATION_JSON)
                .content(mapper.writeValueAsString(buildRequestBody(req))))
            .andReturn();

        // evict failure must NOT cause the PUT to fail — still 200
        assertThat(resultB.getResponse().getStatus())
            .as("Case B: PUT /api/ha-mssp/tenants/%d should return 200 even when evict throws", id)
            .isEqualTo(200);

        // evict still called exactly once despite throwing
        verify(tenantResolver, times(1)).evict(id);

        // response body equals the DTO returned by the service
        TenantDetailDTO responseBody = mapper.readValue(
            resultB.getResponse().getContentAsString(), TenantDetailDTO.class);
        assertThat(responseBody.id()).isEqualTo(dto.id());
        assertThat(responseBody.name()).isEqualTo(dto.name());
        assertThat(responseBody.clientPrefix()).isEqualTo(dto.clientPrefix());
        assertThat(responseBody.maxUsers()).isEqualTo(dto.maxUsers());
        assertThat(responseBody.licenceType()).isEqualTo(dto.licenceType());
        assertThat(responseBody.contactEmail()).isEqualTo(dto.contactEmail());
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    /**
     * Builds a valid {@link TenantDetailDTO} for the given {@code id} and request.
     * The sparkline and trend arrays are filled with zeros (valid per the DTO contract
     * — buckets where data is unavailable are {@code 0}).
     */
    private TenantDetailDTO buildTenantDetailDTO(Long id, UpdateTenantRequest req) {
        return new TenantDetailDTO(
            id,
            req.name(),
            "testprefix",
            req.maxUsers(),
            req.licenceType(),
            req.contactEmail(),
            /* userCount */ 3,
            /* eps */ 42L,
            new long[60],   // epsSparkline: exactly 60 elements
            new long[7]     // alertsTrend7d: exactly 7 elements
        );
    }

    /**
     * Serialises an {@link UpdateTenantRequest} as a plain {@link java.util.Map}
     * so Jackson renders it as a JSON object without needing any special module.
     */
    private Map<String, Object> buildRequestBody(UpdateTenantRequest req) {
        return Map.of(
            "name", req.name(),
            "maxUsers", req.maxUsers(),
            "licenceType", req.licenceType(),
            "contactEmail", req.contactEmail()
        );
    }

    // =========================================================================
    // Providers
    // =========================================================================

    /**
     * Generates positive {@code Long} ids in the range [1, Long.MAX_VALUE].
     * Negative ids and zero are excluded because {@code ha_client.id} is a
     * generated primary key and is always positive.
     */
    @Provide
    Arbitrary<Long> validIds() {
        return Arbitraries.longs().greaterOrEqual(1L);
    }

    /**
     * Generates valid {@link UpdateTenantRequest} instances whose fields satisfy
     * all Jakarta bean-validation constraints declared on the DTO:
     * <ul>
     *   <li>{@code name} — {@code @NotBlank @Size(max = 100)}: 1–100 non-blank chars.</li>
     *   <li>{@code maxUsers} — {@code @Positive}: integer in [1, 10_000].</li>
     *   <li>{@code licenceType} — {@code @NotBlank}: non-blank string of 1–30 chars.</li>
     *   <li>{@code contactEmail} — {@code @Email}: well-formed email address.</li>
     * </ul>
     *
     * <p>All generated instances pass bean-validation so the controller's
     * {@code @Valid} binding never triggers a {@code 400} response and the test
     * exercises only the evict logic.
     */
    @Provide
    Arbitrary<UpdateTenantRequest> validUpdateRequests() {
        Arbitrary<String> names = Arbitraries.strings()
            .alpha()
            .ofMinLength(1)
            .ofMaxLength(100)
            .filter(s -> !s.isBlank());

        Arbitrary<Integer> maxUsers = Arbitraries.integers()
            .between(1, 10_000);

        Arbitrary<String> licenceTypes = Arbitraries.of(
            "standard", "professional", "enterprise");

        Arbitrary<String> emails = Arbitraries.strings()
            .alpha()
            .ofMinLength(3)
            .ofMaxLength(20)
            .flatMap(local ->
                Arbitraries.strings()
                    .alpha()
                    .ofMinLength(2)
                    .ofMaxLength(10)
                    .map(domain -> local + "@" + domain + ".com"));

        return Combinators.combine(names, maxUsers, licenceTypes, emails)
            .as(UpdateTenantRequest::new);
    }
}
