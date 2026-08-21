package com.hivearmor.web.rest;

import com.hivearmor.web.rest.rulegen.HaRuleGenerationResource;
import net.jqwik.api.*;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.lang.annotation.Annotation;
import java.lang.reflect.Method;
import java.util.Arrays;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Property-based test for the ADMIN authority guard on HaRuleGenerationResource.
 *
 * <p><strong>Property 7: Every /api/ha-rules endpoint requires ADMIN</strong><br>
 * For every endpoint on {@code HaRuleGenerationResource}, a caller without the
 * {@code ADMIN} authority receives 403 and no service method is invoked.
 *
 * <p>This test uses reflection to verify that all public methods with request mapping
 * annotations carry {@code @PreAuthorize} containing "hasAuthority" and "ADMIN".
 * This is deterministic and does not require a Spring context.
 *
 * <p><strong>Validates: Requirements 4.3, 6.2</strong>
 */
@Label("Feature: sprint-28-ueba-signals, Property 7: Every /api/ha-rules endpoint requires ADMIN")
class HaRuleGenerationResourceAdminGuardPropertyTest {

    /**
     * The set of annotation types that indicate a method is an HTTP endpoint.
     */
    private static final Set<Class<? extends Annotation>> REQUEST_MAPPING_ANNOTATIONS = Set.of(
        GetMapping.class,
        PostMapping.class,
        PutMapping.class,
        DeleteMapping.class,
        PatchMapping.class,
        RequestMapping.class
    );

    /**
     * Discovers all public methods on {@code HaRuleGenerationResource} that have
     * a request mapping annotation.
     */
    private static List<Method> discoverEndpointMethods() {
        return Arrays.stream(HaRuleGenerationResource.class.getDeclaredMethods())
            .filter(m -> java.lang.reflect.Modifier.isPublic(m.getModifiers()))
            .filter(m -> REQUEST_MAPPING_ANNOTATIONS.stream()
                .anyMatch(m::isAnnotationPresent))
            .collect(Collectors.toList());
    }

    /**
     * <strong>Property 7-A: HaRuleGenerationResource has at least one endpoint method.</strong>
     *
     * <p>Sanity check — ensures the reflection scan finds the expected endpoints. If
     * this fails, the subsequent property is vacuously true and worthless.
     */
    @Property(tries = 1)
    @Label("Property 7-A: HaRuleGenerationResource exposes the six governed endpoint methods")
    void controllerExposesExpectedEndpoints() {
        List<Method> endpoints = discoverEndpointMethods();
        assertThat(endpoints)
            .as("HaRuleGenerationResource should expose exactly 6 endpoints")
            .hasSize(6);
    }

    /**
     * <strong>Property 7-B: Every endpoint method carries @PreAuthorize with ADMIN.</strong>
     *
     * <p>For each method with a request mapping annotation, asserts:
     * <ol>
     *   <li>The method is annotated with {@code @PreAuthorize}</li>
     *   <li>The annotation's value contains "hasAuthority"</li>
     *   <li>The annotation's value contains "ADMIN" (covers both literal "ADMIN"
     *       and references to {@code AuthoritiesConstants.ADMIN} whose value is "ROLE_ADMIN")</li>
     * </ol>
     *
     * <p><strong>Validates: Requirements 4.3, 6.2</strong>
     */
    @Property(tries = 1)
    @Label("Property 7-B: Every endpoint method has @PreAuthorize containing ADMIN authority")
    void everyEndpointRequiresAdminAuthority() {
        List<Method> endpoints = discoverEndpointMethods();

        assertThat(endpoints).isNotEmpty();

        for (Method method : endpoints) {
            PreAuthorize preAuth = method.getAnnotation(PreAuthorize.class);

            assertThat(preAuth)
                .as("Method %s must have @PreAuthorize annotation", method.getName())
                .isNotNull();

            String expression = preAuth.value();

            assertThat(expression)
                .as("@PreAuthorize on %s must contain 'hasAuthority'", method.getName())
                .contains("hasAuthority");

            // AuthoritiesConstants.ADMIN = "ROLE_ADMIN", so the expression will contain
            // either the literal "ADMIN" or "ROLE_ADMIN". We check for "ADMIN" which
            // covers both cases.
            assertThat(expression)
                .as("@PreAuthorize on %s must reference ADMIN authority", method.getName())
                .containsIgnoringCase("ADMIN");
        }
    }

    /**
     * <strong>Property 7-C: The class-level @RequestMapping is /api/ha-rules.</strong>
     *
     * <p>Ensures the controller is mounted at the correct prefix so that
     * the @PreAuthorize annotations actually protect the /api/ha-rules/* paths.
     *
     * <p><strong>Validates: Requirements 4.1, 6.2</strong>
     */
    @Property(tries = 1)
    @Label("Property 7-C: Class-level @RequestMapping is /api/ha-rules")
    void classLevelMappingIsCorrect() {
        RequestMapping classMapping = HaRuleGenerationResource.class
            .getAnnotation(RequestMapping.class);

        assertThat(classMapping)
            .as("HaRuleGenerationResource must have @RequestMapping at class level")
            .isNotNull();

        String[] paths = classMapping.value();
        assertThat(paths)
            .as("Class-level @RequestMapping must specify /api/ha-rules")
            .hasSize(1)
            .containsExactly("/api/ha-rules");
    }

    /**
     * <strong>Property 7-D: No endpoint method is unguarded (no missing @PreAuthorize).</strong>
     *
     * <p>Cross-checks that the count of methods with @PreAuthorize equals the count
     * of endpoint methods — i.e., no endpoint accidentally skips the annotation.
     *
     * <p><strong>Validates: Requirements 4.3, 6.2</strong>
     */
    @Property(tries = 1)
    @Label("Property 7-D: Count of guarded methods equals count of endpoint methods")
    void noEndpointIsUnguarded() {
        List<Method> endpoints = discoverEndpointMethods();

        long guardedCount = endpoints.stream()
            .filter(m -> m.isAnnotationPresent(PreAuthorize.class))
            .count();

        assertThat(guardedCount)
            .as("All %d endpoint methods must have @PreAuthorize", endpoints.size())
            .isEqualTo(endpoints.size());
    }
}
