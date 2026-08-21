package com.hivearmor.web.rest.ueba;

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
 * Property-based test for the ANALYST-or-ADMIN authority guard on HaUebaResource.
 *
 * <p><strong>Property 8: Every {@code /api/ha-ueba/*} endpoint requires ANALYST or ADMIN</strong><br>
 * For every endpoint defined on {@code HaUebaResource}, a caller carrying neither the
 * {@code ANALYST} nor the {@code ADMIN} authority receives HTTP 403 and no service
 * method is invoked.
 *
 * <p>This test uses reflection to verify that all public methods with request mapping
 * annotations carry {@code @PreAuthorize("hasAnyAuthority('ANALYST','ADMIN')")}. This
 * is deterministic and does not require a Spring context.
 *
 * <p><strong>Validates: Requirements 4.8, 7.2</strong>
 */
@Label("Feature: sprint-29-ueba-baseline, Property 8: Every /api/ha-ueba/* endpoint requires ANALYST or ADMIN")
class HaUebaResourceAnalystAdminGuardPropertyTest {

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
     * The expected PreAuthorize expression value on every endpoint.
     */
    private static final String EXPECTED_PRE_AUTHORIZE_EXPRESSION =
        "hasAnyAuthority('ANALYST','ADMIN')";

    /**
     * Discovers all public methods on {@code HaUebaResource} that have
     * a request mapping annotation.
     */
    private static List<Method> discoverEndpointMethods() {
        return Arrays.stream(HaUebaResource.class.getDeclaredMethods())
            .filter(m -> java.lang.reflect.Modifier.isPublic(m.getModifiers()))
            .filter(m -> REQUEST_MAPPING_ANNOTATIONS.stream()
                .anyMatch(m::isAnnotationPresent))
            .collect(Collectors.toList());
    }

    /**
     * <strong>Property 8-A: HaUebaResource has at least six endpoint methods.</strong>
     *
     * <p>Sanity check — ensures the reflection scan finds the expected endpoints. If
     * this fails, the subsequent property is vacuously true and worthless. The design
     * specifies six GET endpoints (deviations, risk-scores, entity-timeline, peer-groups,
     * risk-trend, anomaly-counts).
     *
     * <p><strong>Validates: Requirements 4.8, 7.2</strong>
     */
    @Property(tries = 1)
    @Label("Property 8-A: HaUebaResource exposes at least 6 endpoint methods")
    void controllerExposesExpectedEndpoints() {
        List<Method> endpoints = discoverEndpointMethods();
        assertThat(endpoints)
            .as("HaUebaResource should expose at least 6 endpoints")
            .hasSizeGreaterThanOrEqualTo(6);
    }

    /**
     * <strong>Property 8-B: Every endpoint method carries @PreAuthorize with ANALYST and ADMIN.</strong>
     *
     * <p>For each method with a request mapping annotation, asserts:
     * <ol>
     *   <li>The method is annotated with {@code @PreAuthorize}</li>
     *   <li>The annotation's value contains "hasAnyAuthority"</li>
     *   <li>The annotation's value contains "ANALYST"</li>
     *   <li>The annotation's value contains "ADMIN"</li>
     * </ol>
     *
     * <p><strong>Validates: Requirements 4.8, 7.2</strong>
     */
    @Property(tries = 1)
    @Label("Property 8-B: Every endpoint method has @PreAuthorize containing ANALYST and ADMIN")
    void everyEndpointRequiresAnalystOrAdminAuthority() {
        List<Method> endpoints = discoverEndpointMethods();

        assertThat(endpoints).isNotEmpty();

        for (Method method : endpoints) {
            PreAuthorize preAuth = method.getAnnotation(PreAuthorize.class);

            assertThat(preAuth)
                .as("Method %s must have @PreAuthorize annotation", method.getName())
                .isNotNull();

            String expression = preAuth.value();

            assertThat(expression)
                .as("@PreAuthorize on %s must contain 'hasAnyAuthority'", method.getName())
                .contains("hasAnyAuthority");

            assertThat(expression)
                .as("@PreAuthorize on %s must reference ANALYST authority", method.getName())
                .contains("ANALYST");

            assertThat(expression)
                .as("@PreAuthorize on %s must reference ADMIN authority", method.getName())
                .contains("ADMIN");
        }
    }

    /**
     * <strong>Property 8-C: The class-level @RequestMapping is /api/ha-ueba.</strong>
     *
     * <p>Ensures the controller is mounted at the correct prefix so that
     * the @PreAuthorize annotations actually protect the /api/ha-ueba/* paths.
     *
     * <p><strong>Validates: Requirements 4.1, 7.2</strong>
     */
    @Property(tries = 1)
    @Label("Property 8-C: Class-level @RequestMapping is /api/ha-ueba")
    void classLevelMappingIsCorrect() {
        RequestMapping classMapping = HaUebaResource.class
            .getAnnotation(RequestMapping.class);

        assertThat(classMapping)
            .as("HaUebaResource must have @RequestMapping at class level")
            .isNotNull();

        String[] paths = classMapping.value();
        assertThat(paths)
            .as("Class-level @RequestMapping must specify /api/ha-ueba")
            .hasSize(1)
            .containsExactly("/api/ha-ueba");
    }

    /**
     * <strong>Property 8-D: No endpoint method is unguarded (no missing @PreAuthorize).</strong>
     *
     * <p>Cross-checks that the count of methods with @PreAuthorize equals the count
     * of endpoint methods — i.e., no endpoint accidentally skips the annotation.
     *
     * <p><strong>Validates: Requirements 4.8, 7.2</strong>
     */
    @Property(tries = 1)
    @Label("Property 8-D: Count of guarded methods equals count of endpoint methods")
    void noEndpointIsUnguarded() {
        List<Method> endpoints = discoverEndpointMethods();

        long guardedCount = endpoints.stream()
            .filter(m -> m.isAnnotationPresent(PreAuthorize.class))
            .count();

        assertThat(guardedCount)
            .as("All %d endpoint methods must have @PreAuthorize", endpoints.size())
            .isEqualTo(endpoints.size());
    }

    /**
     * <strong>Property 8-E: The @PreAuthorize expression exactly matches the expected guard.</strong>
     *
     * <p>Verifies that every endpoint uses the exact expression
     * {@code hasAnyAuthority('ANALYST','ADMIN')} rather than a superset or subset
     * of authorities that might inadvertently widen or narrow access.
     *
     * <p><strong>Validates: Requirements 4.8, 7.2</strong>
     */
    @Property(tries = 1)
    @Label("Property 8-E: @PreAuthorize expression is exactly hasAnyAuthority('ANALYST','ADMIN')")
    void preAuthorizeExpressionIsExact() {
        List<Method> endpoints = discoverEndpointMethods();

        assertThat(endpoints).isNotEmpty();

        for (Method method : endpoints) {
            PreAuthorize preAuth = method.getAnnotation(PreAuthorize.class);
            assertThat(preAuth)
                .as("Method %s must have @PreAuthorize annotation", method.getName())
                .isNotNull();

            assertThat(preAuth.value())
                .as("@PreAuthorize on %s must be exactly '%s'",
                    method.getName(), EXPECTED_PRE_AUTHORIZE_EXPRESSION)
                .isEqualTo(EXPECTED_PRE_AUTHORIZE_EXPRESSION);
        }
    }
}
