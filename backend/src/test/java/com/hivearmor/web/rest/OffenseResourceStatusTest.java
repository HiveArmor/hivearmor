package com.hivearmor.web.rest;

import com.hivearmor.service.application_events.ApplicationEventService;
import com.hivearmor.service.elasticsearch.ElasticsearchService;
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
import java.util.Collections;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * F02 — offense status authz + safe update (no string-built Painless from request input).
 */
@ExtendWith(MockitoExtension.class)
class OffenseResourceStatusTest {

    @Mock
    private ElasticsearchService elasticsearchService;

    @Mock
    private ApplicationEventService applicationEventService;

    private MockMvc mockMvc;

    private static final OncePerRequestFilter ANALYST_AUTH_FILTER = new OncePerRequestFilter() {
        @Override
        protected void doFilterInternal(HttpServletRequest request,
                                        HttpServletResponse response,
                                        FilterChain filterChain)
                throws ServletException, IOException {
            UsernamePasswordAuthenticationToken auth = new UsernamePasswordAuthenticationToken(
                    "analyst-stub",
                    null,
                    Collections.singletonList(new SimpleGrantedAuthority("ROLE_ANALYST"))
            );
            SecurityContextHolder.getContext().setAuthentication(auth);
            filterChain.doFilter(request, response);
        }
    };

    @BeforeEach
    void setUp() {
        OffenseResource controller = new OffenseResource(elasticsearchService, applicationEventService);
        mockMvc = MockMvcBuilders
                .standaloneSetup(controller)
                .addFilter(ANALYST_AUTH_FILTER)
                .build();
        SecurityContextHolder.clearContext();
    }

    @Test
    void updateOffenseStatus_rejectsNonAllowlistedStatus() throws Exception {
        mockMvc.perform(put("/api/offenses/off-1/status")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\":\"'; ctx._source.hacked=true; //\"}"))
                .andExpect(status().isBadRequest());

        verify(elasticsearchService, never()).updateByQuery(any(), anyString(), anyString());
    }

    @Test
    void updateOffenseStatus_acceptsAllowlistedStatus() throws Exception {
        mockMvc.perform(put("/api/offenses/off-1/status")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\":\"closed\"}"))
                .andExpect(status().isOk());

        verify(elasticsearchService).updateByQuery(any(), anyString(), anyString());
    }

    /**
     * ROLE_USER must receive HTTP 403 when method security is active.
     * Static nested class mirrors {@link PlaybookResourceTest} authz pattern.
     */
    @ExtendWith(SpringExtension.class)
    @ContextConfiguration(classes = RequiresQueueAuthConfig.class)
    static class UpdateRequiresQueueAuthTest {

        @Autowired
        private OffenseResource securedController;

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
        void updateOffenseStatus_requiresQueueAuthority() throws Exception {
            mockMvc.perform(put("/api/offenses/off-1/status")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"status\":\"closed\"}"))
                    .andExpect(status().isForbidden());
        }
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
    static class RequiresQueueAuthConfig {

        @Bean
        ElasticsearchService elasticsearchService() {
            return mock(ElasticsearchService.class);
        }

        @Bean
        ApplicationEventService applicationEventService() {
            return mock(ApplicationEventService.class);
        }

        @Bean
        OffenseResource offenseResource(ElasticsearchService elasticsearchService,
                                        ApplicationEventService applicationEventService) {
            return new OffenseResource(elasticsearchService, applicationEventService);
        }
    }
}
