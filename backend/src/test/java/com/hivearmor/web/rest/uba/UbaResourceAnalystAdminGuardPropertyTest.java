package com.hivearmor.web.rest.uba;

import net.jqwik.api.Label;
import net.jqwik.api.Property;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
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
 * DET-ML-001a — every {@code /api/uba/*} endpoint requires the same Analyst+
 * guard as {@code HaUebaResource}.
 */
@Label("DET-ML-001a: Every /api/uba/* endpoint requires ROLE_ANALYST, ROLE_SOC_MANAGER, or ROLE_ADMIN")
class UbaResourceAnalystAdminGuardPropertyTest {

    private static final Set<Class<? extends Annotation>> REQUEST_MAPPING_ANNOTATIONS = Set.of(
        GetMapping.class,
        PostMapping.class,
        PutMapping.class,
        DeleteMapping.class,
        PatchMapping.class,
        RequestMapping.class
    );

    private static final String EXPECTED_PRE_AUTHORIZE_EXPRESSION =
        "hasAnyAuthority('ROLE_ANALYST','ROLE_SOC_MANAGER','ROLE_ADMIN')";

    private static List<Method> discoverEndpointMethods() {
        return Arrays.stream(UbaResource.class.getDeclaredMethods())
            .filter(m -> java.lang.reflect.Modifier.isPublic(m.getModifiers()))
            .filter(m -> REQUEST_MAPPING_ANNOTATIONS.stream().anyMatch(m::isAnnotationPresent))
            .collect(Collectors.toList());
    }

    @Property(tries = 1)
    @Label("DET-ML-001a-A: UbaResource exposes the six legacy endpoints")
    void controllerExposesExpectedEndpoints() {
        assertThat(discoverEndpointMethods())
            .as("UbaResource should expose the six legacy /api/uba endpoints")
            .hasSizeGreaterThanOrEqualTo(6);
    }

    @Property(tries = 1)
    @Label("DET-ML-001a-B: Every endpoint has @PreAuthorize Analyst | SOC Manager | Admin")
    void everyEndpointRequiresAnalystSocManagerOrAdminAuthority() {
        List<Method> endpoints = discoverEndpointMethods();
        assertThat(endpoints).isNotEmpty();
        for (Method method : endpoints) {
            PreAuthorize preAuth = method.getAnnotation(PreAuthorize.class);
            assertThat(preAuth)
                .as("Method %s must have @PreAuthorize", method.getName())
                .isNotNull();
            assertThat(preAuth.value())
                .as("@PreAuthorize on %s must match HaUebaResource", method.getName())
                .isEqualTo(EXPECTED_PRE_AUTHORIZE_EXPRESSION);
        }
    }

    @Property(tries = 1)
    @Label("DET-ML-001a-C: Class-level @RequestMapping is /api/uba")
    void classLevelMappingIsCorrect() {
        RequestMapping classMapping = UbaResource.class.getAnnotation(RequestMapping.class);
        assertThat(classMapping).isNotNull();
        assertThat(classMapping.value()).containsExactly("/api/uba");
    }

    @Property(tries = 1)
    @Label("DET-ML-001a-D: No endpoint is unguarded")
    void noEndpointIsUnguarded() {
        List<Method> endpoints = discoverEndpointMethods();
        long guarded = endpoints.stream().filter(m -> m.isAnnotationPresent(PreAuthorize.class)).count();
        assertThat(guarded).isEqualTo(endpoints.size());
    }
}
