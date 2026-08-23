package com.hivearmor.web.rest.agent_manager;

import org.junit.jupiter.api.Test;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestMapping;

import java.lang.annotation.Annotation;
import java.lang.reflect.Method;
import java.util.Arrays;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Verifies AgentManagerResource endpoints carry role gates (F03 / GAP-SEC-05 REST layer).
 */
class AgentManagerResourcePreAuthorizeTest {

    private static final Set<Class<? extends Annotation>> MAPPINGS = Set.of(
        GetMapping.class, PostMapping.class, PutMapping.class, DeleteMapping.class, RequestMapping.class
    );

    private static List<Method> endpoints() {
        return Arrays.stream(AgentManagerResource.class.getDeclaredMethods())
            .filter(m -> Arrays.stream(m.getAnnotations()).anyMatch(a -> MAPPINGS.contains(a.annotationType())))
            .collect(Collectors.toList());
    }

    @Test
    void everyMappedMethodHasPreAuthorize() {
        List<Method> methods = endpoints();
        assertThat(methods).isNotEmpty();
        for (Method m : methods) {
            PreAuthorize pre = m.getAnnotation(PreAuthorize.class);
            assertThat(pre)
                .as("Method %s must have @PreAuthorize", m.getName())
                .isNotNull();
            assertThat(pre.value()).contains("hasAnyAuthority");
        }
    }

    @Test
    void mutateEndpointsRequireAdminOrSocManager() {
        for (String name : List.of("updateAgentAttributes", "canRunCommand")) {
            Method m = Arrays.stream(AgentManagerResource.class.getDeclaredMethods())
                .filter(x -> x.getName().equals(name))
                .findFirst()
                .orElseThrow();
            PreAuthorize pre = m.getAnnotation(PreAuthorize.class);
            assertThat(pre).isNotNull();
            assertThat(pre.value()).contains("ROLE_ADMIN");
            assertThat(pre.value()).contains("ROLE_SOC_MANAGER");
            assertThat(pre.value()).doesNotContain("ROLE_USER");
        }
    }
}
