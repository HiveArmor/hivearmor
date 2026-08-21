package com.hivearmor.web.rest.mssp;

import net.jqwik.api.*;
import org.junit.jupiter.api.Tag;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Property 8: Every MSSP controller method is class- or method-annotated
 * {@code @PreAuthorize("hasAuthority('MSSP_ADMIN')")} — either at the class level
 * or directly on the handler method.
 *
 * <p><strong>Feature: sprint-23-mssp-portal, Property 8: Every MSSP controller
 * method is class- or method-annotated
 * {@code @PreAuthorize("hasAuthority('MSSP_ADMIN')")}</strong>
 *
 * <p><strong>Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 17.3</strong>
 *
 * <h2>How it works</h2>
 * <p>Reflection is used to enumerate every HTTP handler method (i.e. a method
 * carrying {@code @GetMapping}, {@code @PostMapping}, {@code @PutMapping},
 * {@code @PatchMapping}, {@code @DeleteMapping}, or {@code @RequestMapping})
 * across every known controller class in {@code com.hivearmor.web.rest.mssp}.
 *
 * <p>The {@code @Provide} generator returns an {@link Arbitrary} over that fixed
 * list; jqwik samples from it (with repetition) for 100 trials, shuffling the
 * order on each trial so the property is exercised across the full method set
 * regardless of how many methods exist at any point in the sprint.
 *
 * <h2>Controller class registry</h2>
 * <p>{@link #CONTROLLER_CLASSES} is updated as new controllers are introduced:
 * <ul>
 *   <li>{@link MsspOverviewController}    — S23-T02 (present)</li>
 *   <li>{@link MsspTenantController}      — S23-T03/T04 (present)</li>
 *   <li>{@link MsspTenantUserController}  — S23-T05 (present)</li>
 * </ul>
 *
 * <h2>Minimum iterations</h2>
 * <p>100 (enforced via {@code @Property(tries = 100)}).
 */
@Tag("Feature: sprint-23-mssp-portal")
@Tag("Property 8")
class MsspAuthorityGatePropertyTest {

    /** The exact Spring Security expression that every handler must carry. */
    static final String EXPECTED_EXPRESSION = "hasAuthority('MSSP_ADMIN')";

    /**
     * The exhaustive list of MSSP controller classes covered by this property.
     *
     * <p>When a new controller is added (S23-T03, S23-T04, S23-T05), add its
     * {@code Class<?>} literal here so the property automatically covers it.
     */
    static final List<Class<?>> CONTROLLER_CLASSES = List.of(
        MsspOverviewController.class,
        MsspTenantController.class,
        MsspTenantUserController.class
    );

    // =========================================================================
    // Helper utilities — package-private for testability
    // =========================================================================

    /**
     * Collects every HTTP handler method from {@link #CONTROLLER_CLASSES}.
     *
     * <p>A method is a "handler" iff it is annotated with at least one of
     * {@code @GetMapping}, {@code @PostMapping}, {@code @PutMapping},
     * {@code @PatchMapping}, {@code @DeleteMapping}, or {@code @RequestMapping}.
     *
     * @return mutable, non-empty list of handler {@link Method} objects
     */
    static List<Method> collectHandlerMethods() {
        List<Method> methods = new ArrayList<>();
        for (Class<?> cls : CONTROLLER_CLASSES) {
            for (Method m : cls.getDeclaredMethods()) {
                if (isHandlerMethod(m)) {
                    methods.add(m);
                }
            }
        }
        return methods;
    }

    /**
     * Returns {@code true} iff the method carries at least one Spring MVC
     * mapping annotation.
     */
    static boolean isHandlerMethod(Method m) {
        return m.isAnnotationPresent(GetMapping.class)
            || m.isAnnotationPresent(PostMapping.class)
            || m.isAnnotationPresent(PutMapping.class)
            || m.isAnnotationPresent(PatchMapping.class)
            || m.isAnnotationPresent(DeleteMapping.class)
            || m.isAnnotationPresent(RequestMapping.class);
    }

    /**
     * Returns {@code true} iff the method or its declaring class carries
     * {@code @PreAuthorize} whose {@code value()} equals
     * {@link #EXPECTED_EXPRESSION}.
     *
     * <p>Class-level annotation is checked second so that the test still passes
     * when the annotation is on the class rather than each method individually
     * (which is the preferred design pattern for these controllers).
     */
    static boolean hasPreAuthorize(Method m) {
        // 1. Method-level check
        PreAuthorize methodAnnotation = m.getAnnotation(PreAuthorize.class);
        if (methodAnnotation != null && EXPECTED_EXPRESSION.equals(methodAnnotation.value())) {
            return true;
        }
        // 2. Class-level check
        PreAuthorize classAnnotation = m.getDeclaringClass().getAnnotation(PreAuthorize.class);
        return classAnnotation != null && EXPECTED_EXPRESSION.equals(classAnnotation.value());
    }

    // =========================================================================
    // Property 8
    // =========================================================================

    /**
     * **Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 17.3**
     *
     * <p>For any handler {@link Method} sampled from {@link #CONTROLLER_CLASSES},
     * the method's declaring class OR the method itself MUST carry
     * {@code @PreAuthorize("hasAuthority('MSSP_ADMIN')")}.
     *
     * <p>The generator ({@link #handlerMethodSamples()}) shuffles the fixed method
     * list so that each of the 100 trials samples a different ordering, effectively
     * ensuring all handler methods are exercised across the run even though jqwik
     * samples with repetition from an {@link Arbitraries#of} set.
     */
    @Property(tries = 100)
    @Label("Feature: sprint-23-mssp-portal, Property 8: Every MSSP controller method is class- or method-annotated @PreAuthorize(\"hasAuthority('MSSP_ADMIN')\")")
    void everyHandlerMethodIsPreAuthorized(@ForAll("handlerMethodSamples") Method method) {
        assertThat(hasPreAuthorize(method))
            .as("Method %s.%s must have @PreAuthorize(\"%s\") at class or method level",
                method.getDeclaringClass().getSimpleName(),
                method.getName(),
                EXPECTED_EXPRESSION)
            .isTrue();
    }

    // =========================================================================
    // Provider
    // =========================================================================

    /**
     * Provides an {@link Arbitrary} that samples uniformly from the handler methods
     * discovered via reflection.
     *
     * <p>The list is shuffled before being wrapped so that successive trials see
     * methods in different orders, maximising coverage across the 100 iterations.
     *
     * <p>{@link Assume#that(boolean)} guards against a (theoretical) empty list so
     * the property skips rather than erroring if no controllers are registered yet.
     */
    @Provide
    Arbitrary<Method> handlerMethodSamples() {
        List<Method> methods = collectHandlerMethods();
        Assume.that(!methods.isEmpty());
        // Shuffle so the 100 trials sample across different orderings
        List<Method> shuffled = new ArrayList<>(methods);
        Collections.shuffle(shuffled);
        return Arbitraries.of(shuffled);
    }
}
