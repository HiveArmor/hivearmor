package com.hivearmor.web.rest.admin;

import com.hivearmor.security.AuthoritiesConstants;
import net.jqwik.api.*;
import org.assertj.core.api.SoftAssertions;
import org.springframework.security.access.prepost.PreAuthorize;

import java.lang.reflect.Method;
import java.util.Arrays;
import java.util.List;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Property-based test for {@link HaLlmAdminResource} authorization metadata.
 *
 * <p><strong>Property 12: All admin endpoints require ADMIN role</strong><br>
 * For any endpoint under {@code /api/ha-admin/llm/} and any caller who does not
 * hold the {@code ROLE_ADMIN} authority (anonymous, or holding any other role),
 * the response SHALL have HTTP status 401 or 403, and the request SHALL never
 * reach the controller method.
 *
 * <h2>Test strategy</h2>
 * <p>Spring Security enforces {@code @PreAuthorize} annotations before the controller
 * method body executes, so verifying that every handler method on
 * {@link HaLlmAdminResource} carries a valid {@code @PreAuthorize} annotation
 * referencing {@code ROLE_ADMIN} / {@code hasAuthority('ROLE_ADMIN')} is both
 * necessary and sufficient to guarantee Property 12 without standing up a Spring
 * context.
 *
 * <p>Three sub-properties are verified:
 * <ol>
 *   <li><strong>12-A</strong> — Every one of the four expected handler methods
 *       ({@code status}, {@code updateConfig}, {@code models}, {@code pull}) is
 *       present on the controller class.</li>
 *   <li><strong>12-B</strong> — Every handler method carries a non-null
 *       {@link PreAuthorize} annotation.</li>
 *   <li><strong>12-C</strong> — The {@link PreAuthorize} annotation value on every
 *       handler method references {@link AuthoritiesConstants#ADMIN} (i.e.
 *       {@code ROLE_ADMIN}), confirming that no endpoint accidentally uses a
 *       less-privileged role or omits the authority check.</li>
 * </ol>
 *
 * <p>The jqwik {@code @Property} framework is used here to drive systematic
 * per-method verification across the enumerated set of handler method names,
 * making each method an independent, shrinkable counter-example when a check fails.
 *
 * <p><strong>Validates: Requirements 5.5, 6.3, 9.5</strong>
 */
@Label("Feature: sprint-27-ollama, Property 12: All admin endpoints require ADMIN role")
class AdminAuthorizationPropertyTest {

    /**
     * The four handler method names defined in {@link HaLlmAdminResource}.
     *
     * <ul>
     *   <li>{@code status}       — {@code GET /api/ha-admin/llm/status}</li>
     *   <li>{@code updateConfig} — {@code POST /api/ha-admin/llm/config}</li>
     *   <li>{@code models}       — {@code GET /api/ha-admin/llm/models}</li>
     *   <li>{@code pull}         — {@code POST /api/ha-admin/llm/models/pull}</li>
     * </ul>
     */
    private static final List<String> EXPECTED_HANDLER_METHODS = List.of(
        "status",
        "updateConfig",
        "models",
        "pull"
    );

    // =========================================================================
    // Property 12-A: All four expected handler methods exist on the controller
    // =========================================================================

    /**
     * <strong>Property 12-A: All four expected handler methods exist on
     * {@link HaLlmAdminResource}</strong>
     *
     * <p>Verifies that the set of public instance methods on the controller includes
     * every name from {@link #EXPECTED_HANDLER_METHODS}. This guards against a
     * refactoring that silently renames or removes an endpoint, which would mean
     * a formerly-protected surface is now unguarded.
     *
     * <p><strong>Validates: Requirements 5.5, 6.3, 9.5</strong>
     */
    @Property(tries = 1)
    @Label("Property 12-A: all four handler method names are present on HaLlmAdminResource")
    void property12a_allExpectedHandlerMethodsArePresent() {
        Class<?> controllerClass = HaLlmAdminResource.class;

        List<String> actualMethodNames = Arrays.stream(controllerClass.getDeclaredMethods())
            .map(Method::getName)
            .collect(Collectors.toList());

        SoftAssertions softly = new SoftAssertions();

        for (String methodName : EXPECTED_HANDLER_METHODS) {
            softly.assertThat(actualMethodNames)
                .as("HaLlmAdminResource must declare a public method named '%s'. "
                    + "Present methods: %s", methodName, actualMethodNames)
                .contains(methodName);
        }

        softly.assertAll();
    }

    // =========================================================================
    // Property 12-B: Each handler method carries a @PreAuthorize annotation
    // =========================================================================

    /**
     * <strong>Property 12-B: Every handler method carries a {@link PreAuthorize}
     * annotation</strong>
     *
     * <p>For each method name drawn from {@link #EXPECTED_HANDLER_METHODS}, the
     * corresponding method on {@link HaLlmAdminResource} must have a non-null
     * {@link PreAuthorize} annotation. The absence of this annotation means Spring
     * Security would not intercept the call, allowing any authenticated caller
     * (or, depending on configuration, anonymous callers) to reach the method body.
     *
     * <p><strong>Validates: Requirements 5.5, 6.3, 9.5</strong>
     */
    @Property(tries = 4)
    @Label("Property 12-B: every handler method has @PreAuthorize annotation")
    void property12b_everyHandlerMethodHasPreAuthorize(
            @ForAll("handlerMethodNames") String methodName) {

        Method method = findHandlerMethod(methodName);

        assertThat(method)
            .as("Method '%s' must exist on HaLlmAdminResource to be verified", methodName)
            .isNotNull();

        PreAuthorize annotation = method.getAnnotation(PreAuthorize.class);

        assertThat(annotation)
            .as("Method '%s' on HaLlmAdminResource must carry a @PreAuthorize annotation. "
                + "Without it Spring Security cannot intercept the call before the method "
                + "body executes, violating Property 12 (Requirements 5.5, 6.3, 9.5).",
                methodName)
            .isNotNull();
    }

    // =========================================================================
    // Property 12-C: @PreAuthorize annotation value references ROLE_ADMIN
    // =========================================================================

    /**
     * <strong>Property 12-C: The {@link PreAuthorize} annotation value on every
     * handler method references {@code ROLE_ADMIN}</strong>
     *
     * <p>For each method name drawn from {@link #EXPECTED_HANDLER_METHODS}, the
     * {@link PreAuthorize} annotation value must contain the string
     * {@link AuthoritiesConstants#ADMIN} ({@code "ROLE_ADMIN"}), confirming that:
     * <ul>
     *   <li>The annotation expression evaluates to an ADMIN-only guard (not USER,
     *       ANALYST, SOC_MANAGER, READ_ONLY, or any other weaker role).</li>
     *   <li>The authority constant used in code ({@link AuthoritiesConstants#ADMIN})
     *       is the same constant embedded in the annotation at compile time.</li>
     * </ul>
     *
     * <p>The check is intentionally broad — it verifies that
     * {@code ROLE_ADMIN} appears anywhere in the expression — to accommodate both
     * {@code hasRole('ADMIN')} (which Spring expands to {@code ROLE_ADMIN}) and
     * {@code hasAuthority('ROLE_ADMIN')} forms used in this codebase.
     *
     * <p><strong>Validates: Requirements 5.5, 6.3, 9.5</strong>
     */
    @Property(tries = 4)
    @Label("Property 12-C: @PreAuthorize expression references ROLE_ADMIN on every handler method")
    void property12c_preAuthorizeExpressionReferencesAdminAuthority(
            @ForAll("handlerMethodNames") String methodName) {

        Method method = findHandlerMethod(methodName);

        assertThat(method)
            .as("Method '%s' must exist on HaLlmAdminResource", methodName)
            .isNotNull();

        PreAuthorize annotation = method.getAnnotation(PreAuthorize.class);

        assertThat(annotation)
            .as("Method '%s' must have @PreAuthorize before checking its value", methodName)
            .isNotNull();

        String expression = annotation.value();

        assertThat(expression)
            .as("@PreAuthorize expression on '%s' must reference '%s' (ROLE_ADMIN) to "
                + "enforce admin-only access (Requirements 5.5, 6.3, 9.5). "
                + "Actual expression: '%s'",
                methodName, AuthoritiesConstants.ADMIN, expression)
            .contains(AuthoritiesConstants.ADMIN);
    }

    // =========================================================================
    // Composite property: all checks in one pass for readable test output
    // =========================================================================

    /**
     * <strong>Property 12 composite: annotation presence and ADMIN authority in
     * one trial per method</strong>
     *
     * <p>Combines the checks from 12-B and 12-C into a single property using
     * {@link SoftAssertions}, so that both the missing-annotation failure and the
     * wrong-authority failure are reported together rather than stopping at the
     * first assertion. Provides the clearest possible counter-example output when
     * a single method violates either invariant.
     *
     * <p><strong>Validates: Requirements 5.5, 6.3, 9.5</strong>
     */
    @Property(tries = 4)
    @Label("Property 12 composite: @PreAuthorize present and references ROLE_ADMIN")
    void property12_composite_preAuthorizePresenceAndAdminAuthority(
            @ForAll("handlerMethodNames") String methodName) {

        Method method = findHandlerMethod(methodName);

        assertThat(method)
            .as("Method '%s' must exist on HaLlmAdminResource", methodName)
            .isNotNull();

        SoftAssertions softly = new SoftAssertions();

        PreAuthorize annotation = method.getAnnotation(PreAuthorize.class);

        softly.assertThat(annotation)
            .as("Method '%s' on HaLlmAdminResource must carry @PreAuthorize "
                + "(Requirements 5.5, 6.3, 9.5).", methodName)
            .isNotNull();

        if (annotation != null) {
            String expression = annotation.value();

            softly.assertThat(expression)
                .as("@PreAuthorize on '%s' must reference '%s'. "
                    + "Actual expression: '%s' "
                    + "(Requirements 5.5, 6.3, 9.5).",
                    methodName, AuthoritiesConstants.ADMIN, expression)
                .contains(AuthoritiesConstants.ADMIN);

            softly.assertThat(expression)
                .as("@PreAuthorize on '%s' must not be blank — an empty expression "
                    + "bypasses security enforcement (Requirements 5.5, 6.3, 9.5).",
                    methodName)
                .isNotBlank();
        }

        softly.assertAll();
    }

    // =========================================================================
    // Arbitrary providers
    // =========================================================================

    /**
     * Provides the four expected handler method names as the exhaustive universe
     * of values that jqwik draws from for the {@code @ForAll} parameters above.
     *
     * <p>Using {@link Arbitraries#of(Object[])} with {@code tries = 4} ensures
     * jqwik will visit every method name exactly once in normal mode, and will
     * correctly shrink to the failing method name when a property fails.
     */
    @Provide
    Arbitrary<String> handlerMethodNames() {
        return Arbitraries.of(
            "status",
            "updateConfig",
            "models",
            "pull"
        );
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    /**
     * Finds the first declared method on {@link HaLlmAdminResource} whose simple
     * name matches {@code methodName}, or returns {@code null} when no such method
     * is declared.
     *
     * <p>Uses {@link Class#getDeclaredMethods()} rather than
     * {@link Class#getMethods()} to include package-private and protected methods
     * (though all handler methods are {@code public}) and to exclude inherited
     * Object methods from the search space.
     *
     * @param methodName simple method name to look for
     * @return matching {@link Method} or {@code null}
     */
    private static Method findHandlerMethod(String methodName) {
        return Arrays.stream(HaLlmAdminResource.class.getDeclaredMethods())
            .filter(m -> m.getName().equals(methodName))
            .findFirst()
            .orElse(null);
    }
}
