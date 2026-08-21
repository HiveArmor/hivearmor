package com.hivearmor.web.rest.mssp;

import com.hivearmor.multitenancy.MsspTenantResolver;
import com.hivearmor.service.mssp.MsspProvisioningService;
import com.hivearmor.service.mssp.MsspTenantService;
import com.hivearmor.service.mssp.dto.TenantHealthDTO;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableHandlerMethodArgumentResolver;
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
import java.util.List;

import static org.hamcrest.Matchers.hasSize;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * Unit tests for {@link MsspTenantController#listTenants} — standalone MockMvc.
 *
 * <p>Uses the same standalone setup + MSSP_ADMIN auth-filter pattern as
 * {@link MsspOverviewControllerTest}. Covered scenarios:
 * <ol>
 *   <li>Happy path list → 200 with {@code X-Total-Count} header and body</li>
 *   <li>List with {@code ?q} filter → 200 with filtered results</li>
 * </ol>
 *
 * <p>Sprint 23 — MSSP portal backend.
 */
@ExtendWith(MockitoExtension.class)
class MsspTenantControllerListTest {

    @Mock
    private MsspProvisioningService provisioningService;

    @Mock
    private MsspTenantService tenantService;

    @Mock
    private MsspTenantResolver tenantResolver;

    private MockMvc mockMvc;

    // -------------------------------------------------------------------------
    // Stub filter — installs MSSP_ADMIN authority in the SecurityContext
    // -------------------------------------------------------------------------

    private static final OncePerRequestFilter MSSP_ADMIN_AUTH_FILTER = new OncePerRequestFilter() {
        @Override
        protected void doFilterInternal(HttpServletRequest request,
                                        HttpServletResponse response,
                                        FilterChain filterChain)
                throws ServletException, IOException {
            UsernamePasswordAuthenticationToken auth = new UsernamePasswordAuthenticationToken(
                    "mssp-admin-stub", null,
                    Collections.singletonList(new SimpleGrantedAuthority("MSSP_ADMIN"))
            );
            SecurityContextHolder.getContext().setAuthentication(auth);
            filterChain.doFilter(request, response);
        }
    };

    @BeforeEach
    void setUp() {
        MsspTenantController controller =
                new MsspTenantController(provisioningService, tenantService, tenantResolver);

        mockMvc = MockMvcBuilders
                .standaloneSetup(controller)
                .addFilter(MSSP_ADMIN_AUTH_FILTER)
                .setCustomArgumentResolvers(new PageableHandlerMethodArgumentResolver())
                .build();

        SecurityContextHolder.clearContext();
    }

    // =========================================================================
    // Test 1 — happy path list → 200 + X-Total-Count header
    // =========================================================================

    /**
     * When the service returns two tenants, the controller must respond with
     * HTTP 200, a JSON array of two elements, and an {@code X-Total-Count} header
     * whose value equals the total number of elements in the page.
     *
     * <p>Validates: Requirements 9.1, 9.2
     */
    @Test
    @DisplayName("GET /api/ha-mssp/tenants → 200 with X-Total-Count header and tenant list")
    void listTenants_happyPath_returns200WithTotalCountHeader() throws Exception {
        List<TenantHealthDTO> tenants = List.of(
                new TenantHealthDTO(1L, "Acme Corp",  "acme",  3, 0L, "OFFLINE", null),
                new TenantHealthDTO(2L, "Beta Ltd",   "beta",  7, 0L, "OFFLINE", null)
        );
        when(tenantService.list(isNull(), any(Pageable.class)))
                .thenReturn(new PageImpl<>(tenants, PageRequest.of(0, 20), 2L));

        mockMvc.perform(get("/api/ha-mssp/tenants"))
                .andExpect(status().isOk())
                .andExpect(header().string("X-Total-Count", "2"))
                .andExpect(jsonPath("$", hasSize(2)))
                .andExpect(jsonPath("$[0].clientPrefix").value("acme"))
                .andExpect(jsonPath("$[1].clientPrefix").value("beta"));
    }

    // =========================================================================
    // Test 2 — with ?q filter → 200 + filtered results
    // =========================================================================

    /**
     * When the {@code q} query parameter is supplied, the controller passes it
     * to the service and returns the filtered page. The {@code X-Total-Count}
     * header must reflect the filtered total.
     *
     * <p>Validates: Requirements 9.3, 9.4
     */
    @Test
    @DisplayName("GET /api/ha-mssp/tenants?q=acme → 200 with filtered results")
    void listTenants_withQParam_returnsFilteredResults() throws Exception {
        List<TenantHealthDTO> filtered = List.of(
                new TenantHealthDTO(1L, "Acme Corp", "acme", 3, 0L, "OFFLINE", null)
        );
        when(tenantService.list(eq("acme"), any(Pageable.class)))
                .thenReturn(new PageImpl<>(filtered, PageRequest.of(0, 20), 1L));

        mockMvc.perform(get("/api/ha-mssp/tenants").param("q", "acme"))
                .andExpect(status().isOk())
                .andExpect(header().string("X-Total-Count", "1"))
                .andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].clientPrefix").value("acme"));
    }
}
