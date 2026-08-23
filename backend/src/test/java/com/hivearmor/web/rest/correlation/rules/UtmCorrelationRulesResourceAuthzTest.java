package com.hivearmor.web.rest.correlation.rules;

import com.hivearmor.repository.correlation.config.UtmDataTypesRepository;
import com.hivearmor.service.UtmStackService;
import com.hivearmor.service.application_events.ApplicationEventService;
import com.hivearmor.service.correlation.rules.UtmCorrelationRuleVersionService;
import com.hivearmor.service.correlation.rules.UtmCorrelationRulesService;
import com.hivearmor.service.dto.correlation.UtmCorrelationRulesMapper;
import com.hivearmor.service.dto.correlation.validators.CorrelationRuleValidator;
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
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * F04 — correlation-rule mutate/test/import/activate require ROLE_SOC_MANAGER or ROLE_ADMIN.
 */
@ExtendWith(SpringExtension.class)
@ContextConfiguration(classes = UtmCorrelationRulesResourceAuthzTest.RequiresSocManagerConfig.class)
class UtmCorrelationRulesResourceAuthzTest {

    @Autowired
    private UtmCorrelationRulesResource securedController;

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        OncePerRequestFilter analystOnlyFilter = new OncePerRequestFilter() {
            @Override
            protected void doFilterInternal(HttpServletRequest req,
                                            HttpServletResponse res,
                                            FilterChain chain)
                    throws ServletException, IOException {
                UsernamePasswordAuthenticationToken auth = new UsernamePasswordAuthenticationToken(
                        "analyst-user",
                        null,
                        Collections.singletonList(new SimpleGrantedAuthority("ROLE_ANALYST"))
                );
                SecurityContextHolder.getContext().setAuthentication(auth);
                chain.doFilter(req, res);
            }
        };

        mockMvc = MockMvcBuilders
                .standaloneSetup(securedController)
                .setControllerAdvice(new AccessDenied403Advice())
                .addFilter(analystOnlyFilter)
                .build();
    }

    @Test
    void activateRule_requiresSocManagerOrAdmin() throws Exception {
        mockMvc.perform(put("/api/correlation-rule/activate-deactivate")
                        .param("id", "1")
                        .param("active", "true"))
                .andExpect(status().isForbidden());
    }

    @Test
    void testRule_requiresSocManagerOrAdmin() throws Exception {
        mockMvc.perform(post("/api/correlation-rule/test")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"ruleId\":1}"))
                .andExpect(status().isForbidden());
    }

    @Test
    void importRules_requiresSocManagerOrAdmin() throws Exception {
        mockMvc.perform(post("/api/correlation-rule/import")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"content\":\"title: x\"}"))
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
    static class RequiresSocManagerConfig {

        @Bean
        ApplicationEventService applicationEventService() {
            return mock(ApplicationEventService.class);
        }

        @Bean
        UtmCorrelationRulesService rulesService() {
            return mock(UtmCorrelationRulesService.class);
        }

        @Bean
        UtmCorrelationRulesMapper utmCorrelationRulesMapper() {
            return mock(UtmCorrelationRulesMapper.class);
        }

        @Bean
        UtmStackService utmStackService() {
            return mock(UtmStackService.class);
        }

        @Bean
        CorrelationRuleValidator correlationRuleValidator() {
            return mock(CorrelationRuleValidator.class);
        }

        @Bean
        UtmCorrelationRuleVersionService versionService() {
            return mock(UtmCorrelationRuleVersionService.class);
        }

        @Bean
        UtmDataTypesRepository dataTypesRepository() {
            return mock(UtmDataTypesRepository.class);
        }

        @Bean
        UtmCorrelationRulesResource utmCorrelationRulesResource(
                ApplicationEventService applicationEventService,
                UtmCorrelationRulesService rulesService,
                UtmCorrelationRulesMapper utmCorrelationRulesMapper,
                UtmStackService utmStackService,
                CorrelationRuleValidator correlationRuleValidator,
                UtmCorrelationRuleVersionService versionService,
                UtmDataTypesRepository dataTypesRepository) {
            return new UtmCorrelationRulesResource(
                    applicationEventService,
                    rulesService,
                    utmCorrelationRulesMapper,
                    utmStackService,
                    correlationRuleValidator,
                    versionService,
                    dataTypesRepository);
        }
    }
}
