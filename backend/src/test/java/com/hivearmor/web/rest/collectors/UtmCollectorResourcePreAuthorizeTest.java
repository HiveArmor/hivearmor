package com.hivearmor.web.rest.collectors;

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
 * P0A1-T10 — verifies every /api/collectors endpoint carries a role gate.
 * Before this task the controller had no @PreAuthorize and was only covered by
 * the default .anyRequest().authenticated() rule (authenticated but not authorized).
 * Reads: Analyst/SOC-Manager/Admin. Mutations (config upsert, asset-group, delete):
 * SOC-Manager/Admin only.
 */
class UtmCollectorResourcePreAuthorizeTest {

    private static final Set<Class<? extends Annotation>> MAPPINGS = Set.of(
        GetMapping.class, PostMapping.class, PutMapping.class, DeleteMapping.class, RequestMapping.class
    );

    private static List<Method> endpoints() {
        return Arrays.stream(UtmCollectorResource.class.getDeclaredMethods())
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
    void mutateEndpointsRequireAdminOrSocManagerAndExcludeAnalyst() {
        for (String name : List.of("upsertCollectorConfig", "updateGroup", "deleteCollector")) {
            Method m = Arrays.stream(UtmCollectorResource.class.getDeclaredMethods())
                .filter(x -> x.getName().equals(name))
                .findFirst()
                .orElseThrow();
            PreAuthorize pre = m.getAnnotation(PreAuthorize.class);
            assertThat(pre).as("mutation %s must have @PreAuthorize", name).isNotNull();
            assertThat(pre.value()).contains("ROLE_ADMIN");
            assertThat(pre.value()).contains("ROLE_SOC_MANAGER");
            assertThat(pre.value()).doesNotContain("ROLE_ANALYST");
        }
    }

    @Test
    void readEndpointsAllowAnalyst() {
        for (String name : List.of("listCollectorsByModule", "getModuleGroups",
                                    "searchGroupsByFilter", "searchByFilters")) {
            Method m = Arrays.stream(UtmCollectorResource.class.getDeclaredMethods())
                .filter(x -> x.getName().equals(name))
                .findFirst()
                .orElseThrow();
            PreAuthorize pre = m.getAnnotation(PreAuthorize.class);
            assertThat(pre).as("read %s must have @PreAuthorize", name).isNotNull();
            assertThat(pre.value()).contains("ROLE_ANALYST");
        }
    }
}
