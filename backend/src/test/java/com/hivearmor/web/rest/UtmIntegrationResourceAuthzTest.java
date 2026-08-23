package com.hivearmor.web.rest;

import com.hivearmor.service.UtmIntegrationQueryService;
import com.hivearmor.service.UtmIntegrationService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
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
import java.util.Collections;

import static org.mockito.Mockito.mock;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * F05 — integration mutate endpoints require ROLE_ADMIN.
 *
 * <p>DELETE is the representative mutate path: POST/PUT share the same
 * {@code @PreAuthorize} expression but need a Jackson-deserializable body that
 * standalone MockMvc cannot build for {@code UtmIntegration} (managed back-reference).
 */
@ExtendWith(SpringExtension.class)
@ContextConfiguration(classes = UtmIntegrationResourceAuthzTest.RequiresAdminConfig.class)
class UtmIntegrationResourceAuthzTest {

    @Autowired
    private UtmIntegrationResource securedController;

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
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

    @Test
    void deleteIntegration_requiresAdmin() throws Exception {
        mockMvc.perform(delete("/api/ha-integrations/1")
                        .accept(MediaType.APPLICATION_JSON))
                .andExpect(status().isForbidden());
    }

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

    @Configuration
    @EnableMethodSecurity
    static class RequiresAdminConfig {

        @Bean
        UtmIntegrationService utmIntegrationService() {
            return mock(UtmIntegrationService.class);
        }

        @Bean
        UtmIntegrationQueryService utmIntegrationQueryService() {
            return mock(UtmIntegrationQueryService.class);
        }

        @Bean
        UtmIntegrationResource utmIntegrationResource(UtmIntegrationService utmIntegrationService,
                                                      UtmIntegrationQueryService utmIntegrationQueryService) {
            return new UtmIntegrationResource(utmIntegrationService, utmIntegrationQueryService);
        }
    }
}
