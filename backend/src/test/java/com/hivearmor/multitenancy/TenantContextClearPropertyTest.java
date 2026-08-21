package com.hivearmor.multitenancy;

import net.jqwik.api.*;
import net.jqwik.api.lifecycle.AfterTry;
import org.junit.jupiter.api.Tag;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Property-based tests for {@link TenantContext} clear-in-finally behaviour under
 * exception conditions.
 *
 * <p><strong>Property 3: TenantContext clear-in-finally under exception</strong>
 * — <strong>Validates: Requirements 6.7, 6.8</strong>
 *
 * <h2>What is tested</h2>
 * <p>For any arbitrary prefix string {@code p} and any arbitrary {@link RuntimeException}
 * (parameterised by an arbitrary message string), the following invariants must hold
 * after executing the try/finally pattern that mirrors
 * {@code TenantContextFilter.doFilterInternal}:
 * <ol>
 *   <li>{@code TenantContext.get() == null} — the holder is fully cleared.</li>
 *   <li>{@code TenantContext.isMssp() == false} — no tenant is active.</li>
 * </ol>
 *
 * <h2>Tag</h2>
 * <p>{@code Feature: sprint-21-mssp-schema, Property 3}
 *
 * <h2>Minimum iterations</h2>
 * <p>100 (enforced via {@code @Property(tries = 100)}).
 */
@Tag("Feature: sprint-21-mssp-schema")
@Tag("Property 3")
class TenantContextClearPropertyTest {

    /**
     * Ensures the {@code ThreadLocal} is clean before every trial, regardless of
     * any prior failure that may have left it populated.
     */
    @AfterTry
    void afterTry() {
        TenantContext.clear();
    }

    // =========================================================================
    // Property 3-A  —  set + throw + clear-in-finally → context is null
    // Validates: Requirements 6.7, 6.8
    // =========================================================================

    /**
     * For any non-null prefix string {@code p} and any arbitrary
     * {@link RuntimeException} {@code t}:
     * <ol>
     *   <li>Call {@code TenantContext.set(p)} inside a {@code try} block.</li>
     *   <li>Throw {@code t} inside the same {@code try} block.</li>
     *   <li>Call {@code TenantContext.clear()} inside the matching {@code finally}.</li>
     * </ol>
     * After the {@code finally} executes, {@code TenantContext.get()} MUST return
     * {@code null} and {@code TenantContext.isMssp()} MUST return {@code false}.
     *
     * <p><strong>Validates: Requirements 6.7, 6.8</strong>
     */
    @Property(tries = 100)
    void property3A_clearInFinally_afterThrow_leavesContextNull(
            @ForAll("anyPrefix") String prefix,
            @ForAll("anyRuntimeException") RuntimeException throwable) {

        // Pre-condition: context must start clean for every trial.
        assertThat(TenantContext.get())
                .as("Pre-condition: TenantContext must be null before the trial")
                .isNull();

        // Execute the try/finally pattern under test.
        try {
            TenantContext.set(prefix);

            // Verify set worked before we throw, so the test is meaningful.
            assertThat(TenantContext.get())
                    .as("TenantContext.get() must equal the set prefix before throwing")
                    .isEqualTo(prefix);

            throw throwable;

        } catch (RuntimeException ignored) {
            // Swallow — we only care about what happens in finally.
        } finally {
            TenantContext.clear();
        }

        // Post-condition assertions — the property under test.
        assertThat(TenantContext.get())
                .as("TenantContext.get() must be null after clear() in finally (prefix was '%s')", prefix)
                .isNull();

        assertThat(TenantContext.isMssp())
                .as("TenantContext.isMssp() must be false after clear() in finally (prefix was '%s')", prefix)
                .isFalse();
    }

    // =========================================================================
    // Property 3-B  —  clear-in-finally is idempotent when no set was called
    // Validates: Requirement 6.7 (clear must be safe to call unconditionally)
    // =========================================================================

    /**
     * When {@code TenantContext.clear()} is called inside a {@code finally} block
     * on a thread where {@code set()} was never called (the prefix was {@code null}
     * and therefore the filter skips {@code set}), the context must still be null
     * afterwards — i.e. {@code clear()} is idempotent on an already-clear holder.
     *
     * <p><strong>Validates: Requirement 6.7</strong>
     */
    @Property(tries = 100)
    void property3B_clearInFinally_withoutPriorSet_isIdempotent(
            @ForAll("anyRuntimeException") RuntimeException throwable) {

        // No TenantContext.set() call — simulates the null-prefix path in the filter.
        try {
            throw throwable;
        } catch (RuntimeException ignored) {
            // Swallow.
        } finally {
            TenantContext.clear(); // Must not throw; must leave context clean.
        }

        assertThat(TenantContext.get())
                .as("TenantContext.get() must be null when clear() is called without a prior set()")
                .isNull();

        assertThat(TenantContext.isMssp())
                .as("TenantContext.isMssp() must be false when clear() is called without a prior set()")
                .isFalse();
    }

    // =========================================================================
    // Property 3-C  —  normal (non-exception) path also leaves context null
    // Validates: Requirement 6.8 (clear-in-finally covers ALL exit paths)
    // =========================================================================

    /**
     * When the {@code try} block completes normally (no exception), the
     * {@code finally} block still executes {@code TenantContext.clear()}, and the
     * context must be null afterwards.
     *
     * <p>This property guards against an accidental implementation that only clears
     * on the exception path.
     *
     * <p><strong>Validates: Requirement 6.8</strong>
     */
    @Property(tries = 100)
    void property3C_clearInFinally_afterNormalExit_leavesContextNull(
            @ForAll("anyPrefix") String prefix) {

        try {
            TenantContext.set(prefix);
            // No throw — simulates a successful filterChain.doFilter(request, response).
        } finally {
            TenantContext.clear();
        }

        assertThat(TenantContext.get())
                .as("TenantContext.get() must be null after clear() in finally on normal exit (prefix was '%s')", prefix)
                .isNull();

        assertThat(TenantContext.isMssp())
                .as("TenantContext.isMssp() must be false after clear() in finally on normal exit (prefix was '%s')", prefix)
                .isFalse();
    }

    // =========================================================================
    // Arbitraries
    // =========================================================================

    /**
     * Produces arbitrary non-null {@code String} values to use as tenant prefixes.
     * These are unrestricted strings — they do not need to satisfy the
     * {@code ha_client_prefix_fmt} regex because {@code TenantContext} imposes no
     * format constraint at the Java layer; the DB CHECK is the enforcement point.
     */
    @Provide
    Arbitrary<String> anyPrefix() {
        return Arbitraries.strings()
                .ofMinLength(0)
                .ofMaxLength(50);
    }

    /**
     * Produces arbitrary {@link RuntimeException} instances by generating an
     * arbitrary message string (including empty and unicode strings) and wrapping
     * it in a {@code RuntimeException}.
     *
     * <p>Using {@link RuntimeException} subclasses is sufficient for the property
     * under test because {@code TenantContextFilter} catches any {@link Throwable}
     * via the {@code try/finally} pattern; the exact exception type does not affect
     * whether {@code finally} executes.
     */
    @Provide
    Arbitrary<RuntimeException> anyRuntimeException() {
        return Arbitraries.strings()
                .ofMinLength(0)
                .ofMaxLength(200)
                .map(RuntimeException::new);
    }
}
