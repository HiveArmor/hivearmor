package com.hivearmor.web.rest;

import com.hivearmor.service.PlaybookExecutionInventoryService;
import com.hivearmor.service.PlaybookExecutionStreamService;
import com.hivearmor.service.PlaybookService;
import com.hivearmor.service.dto.PlaybookDTO;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
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
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Optional;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Unit tests for {@link PlaybookResource} — SOAR playbook REST endpoints.
 *
 * <p>Tests 1, 2, 3, and 5 use a pure-Mockito setup with standalone MockMvc and
 * a stub filter that populates the SecurityContext with {@code ROLE_ADMIN}.
 *
 * <p>Test 4 ({@code testExecutePlaybook_requiresAdmin}) uses a nested class annotated
 * with {@link SpringExtension} and {@link ContextConfiguration} to load a minimal
 * Spring context with {@link EnableMethodSecurity} so that the {@code @PreAuthorize}
 * AOP interceptor is active and actually enforces HTTP 403 for non-admin callers.
 * Standalone MockMvc does not enforce method-level security annotations by default.
 *
 * <p>Follows the HiveArmor standalone-MockMvc pattern consistent with
 * {@link HaOidcResourceTest} and {@link HaScimResourceTest}.
 */
@ExtendWith(MockitoExtension.class)
class PlaybookResourceTest {

    @Mock
    private PlaybookService playbookService;

    @Mock
    private PlaybookExecutionStreamService playbookExecutionStreamService;

    private PlaybookResource controller;

    /** MockMvc wired with ROLE_ADMIN stub filter (tests 1, 2, 3, 5). */
    private MockMvc mockMvcAdmin;

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
        controller = new PlaybookResource(playbookService, playbookExecutionStreamService, mock(PlaybookExecutionInventoryService.class));

        mockMvcAdmin = MockMvcBuilders
                .standaloneSetup(controller)
                .addFilter(ADMIN_AUTH_FILTER)
                .build();

        SecurityContextHolder.clearContext();
    }

    // =========================================================================
    // Test 1 — GET /api/ha-playbooks returns a JSON array
    // =========================================================================

    /**
     * {@code GET /api/ha-playbooks} with {@code ROLE_ADMIN} must return HTTP 200 and
     * a JSON array body. An empty list is a valid response for this stub stage.
     *
     * <p>Validates Requirement 1.2: the list endpoint returns {@code List<PlaybookDTO>}.
     */
    @Test
    void testListPlaybooks_returnsArray() throws Exception {
        PlaybookDTO dto = buildPlaybook(1L, "Isolate Host", true);
        when(playbookService.findAll()).thenReturn(List.of(dto));

        mockMvcAdmin.perform(get("/api/ha-playbooks")
                        .accept(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isArray())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].id").value(1))
                .andExpect(jsonPath("$[0].name").value("Isolate Host"));
    }

    // =========================================================================
    // Test 2 — GET /api/ha-playbooks/{id} for an existing id returns steps field
    // =========================================================================

    /**
     * {@code GET /api/ha-playbooks/{id}} for a mocked playbook id must return HTTP 200
     * and a response body that includes a {@code steps} field (array).
     *
     * <p>Validates Requirement 1.3: the detail endpoint returns the DTO with its
     * {@code steps} array populated.
     */
    @Test
    void testGetPlaybook_existingId_returnsSteps() throws Exception {
        PlaybookDTO dto = buildPlaybook(42L, "Block Suspicious IP", true);
        dto.setSteps(new ArrayList<>());

        when(playbookService.findOne(42L)).thenReturn(Optional.of(dto));

        mockMvcAdmin.perform(get("/api/ha-playbooks/42")
                        .accept(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(42))
                .andExpect(jsonPath("$.name").value("Block Suspicious IP"))
                .andExpect(jsonPath("$.steps").isArray());
    }

    // =========================================================================
    // Test 3 — GET /api/ha-playbooks/99999 for an unknown id returns 404
    // =========================================================================

    /**
     * {@code GET /api/ha-playbooks/99999} when no playbook exists for that id must
     * return HTTP 404 Not Found.
     *
     * <p>Validates Requirement 1.3: the detail endpoint returns 404 on a miss.
     */
    @Test
    void testGetPlaybook_unknownId_returns404() throws Exception {
        when(playbookService.findOne(99999L)).thenReturn(Optional.empty());

        mockMvcAdmin.perform(get("/api/ha-playbooks/99999")
                        .accept(MediaType.APPLICATION_JSON))
                .andExpect(status().isNotFound());
    }

    // =========================================================================
    // Test 5 — PATCH /api/ha-playbooks/1/status?active=false returns 204
    // =========================================================================

    /**
     * {@code PATCH /api/ha-playbooks/1/status?active=false} with {@code ROLE_ADMIN} must
     * return HTTP 204 No Content, confirming that the toggle endpoint accepts the request.
     *
     * <p>Validates Requirement 1.6: {@code setActive} is reachable by ROLE_ADMIN and
     * returns 204.
     */
    @Test
    void testSetActive_togglesFlag() throws Exception {
        // setActive is a void no-op stub — no mock setup needed, just verify HTTP 204
        mockMvcAdmin.perform(patch("/api/ha-playbooks/1/status")
                        .param("active", "false"))
                .andExpect(status().isNoContent());
    }

    // =========================================================================
    // Private helpers
    // =========================================================================

    /**
     * Builds a minimal {@link PlaybookDTO} for seeding mock service results.
     *
     * @param id     the playbook primary key
     * @param name   the human-readable playbook name
     * @param active whether the playbook is active
     * @return a populated DTO
     */
    private PlaybookDTO buildPlaybook(Long id, String name, boolean active) {
        PlaybookDTO dto = new PlaybookDTO();
        dto.setId(id);
        dto.setName(name);
        dto.setDescription("Test playbook: " + name);
        dto.setTriggerType("manual");
        dto.setActive(active);
        dto.setRunCount(0);
        dto.setLastRunAt(null);
        dto.setLastRunStatus(null);
        return dto;
    }

    // =========================================================================
    // Nested test — Test 4: POST /execute without ROLE_ADMIN returns HTTP 403
    // =========================================================================

    /**
     * Verifies that a caller holding only {@code ROLE_USER} receives HTTP 403 Forbidden
     * when invoking {@code POST /api/ha-playbooks/1/execute}, with Spring method-security
     * AOP active via a minimal {@link SpringExtension} + {@link EnableMethodSecurity}
     * context.
     *
     * <p>This nested class uses {@link SpringExtension} and {@link ContextConfiguration}
     * to bootstrap a minimal Spring AOP context with method security enabled, so that
     * {@code @PreAuthorize("hasAuthority('ROLE_ADMIN')")} is fully evaluated at the call
     * site. The controller is wired with Mockito-created mock collaborators registered as
     * Spring beans.
     *
     * <p>Validates Requirement 1.5: POST /execute requires ROLE_ADMIN and returns HTTP 403
     * for callers holding only ROLE_USER.
     */
    @ExtendWith(SpringExtension.class)
    @ContextConfiguration(classes = PlaybookResourceTest.RequiresAdminConfig.class)
    static class ExecuteRequiresAdminTest {

        @Autowired
        private PlaybookResource securedController;

        private MockMvc mockMvc;

        @BeforeEach
        void setUp() {
            // Stub filter — sets ROLE_USER only (no ROLE_ADMIN)
            OncePerRequestFilter userOnlyFilter = new OncePerRequestFilter() {
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

            mockMvc = MockMvcBuilders
                    .standaloneSetup(securedController)
                    .setControllerAdvice(new AccessDenied403Advice())
                    .addFilter(userOnlyFilter)
                    .build();
        }

        /**
         * POST /api/ha-playbooks/1/execute without ROLE_ADMIN must return HTTP 403.
         * Spring method security AOP is active in this context, so
         * {@code @PreAuthorize("hasAuthority('ROLE_ADMIN')")} is evaluated and
         * throws {@link org.springframework.security.access.AccessDeniedException}.
         */
        @Test
        void testExecutePlaybook_requiresAdmin() throws Exception {
            mockMvc.perform(post("/api/ha-playbooks/1/execute")
                            .accept(MediaType.APPLICATION_JSON))
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
     * {@link PlaybookResource} with Mockito-created mock collaborators.
     *
     * <p>Used exclusively by {@link ExecuteRequiresAdminTest} to test
     * {@code @PreAuthorize} enforcement in a lightweight Spring AOP context.
     */
    @Configuration
    @EnableMethodSecurity
    static class RequiresAdminConfig {

        @Bean
        PlaybookService playbookService() {
            return mock(PlaybookService.class);
        }

        @Bean
        PlaybookExecutionStreamService playbookExecutionStreamService() {
            return mock(PlaybookExecutionStreamService.class);
        }

        @Bean
        PlaybookExecutionInventoryService playbookExecutionInventoryService() {
            return mock(PlaybookExecutionInventoryService.class);
        }

        @Bean
        PlaybookResource playbookResource(PlaybookService playbookService,
                                          PlaybookExecutionStreamService playbookExecutionStreamService,
                                          PlaybookExecutionInventoryService playbookExecutionInventoryService) {
            return new PlaybookResource(playbookService, playbookExecutionStreamService, playbookExecutionInventoryService);
        }
    }
}
