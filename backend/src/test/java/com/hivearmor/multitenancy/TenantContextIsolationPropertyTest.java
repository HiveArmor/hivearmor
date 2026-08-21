package com.hivearmor.multitenancy;

import net.jqwik.api.*;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.fail;

/**
 * Property-based test for {@link TenantContext} thread isolation.
 *
 * <p><strong>Property 4: TenantContext thread isolation</strong><br>
 * <strong>Validates: Requirements 6.9</strong>
 *
 * <p>For any pair of distinct prefix values {@code (p1, p2)} assigned to two threads
 * {@code T1} and {@code T2} respectively, via a {@link CountDownLatch}-synchronised
 * set/read cycle, {@code T1} observes only {@code p1} on its subsequent
 * {@link TenantContext#get()} call and {@code T2} observes only {@code p2},
 * regardless of thread interleaving.
 *
 * <h2>Test strategy</h2>
 * <p>Two threads are spawned per trial:
 * <ol>
 *   <li>{@code T1} calls {@code TenantContext.set(p1)}.</li>
 *   <li>{@code T2} calls {@code TenantContext.set(p2)}.</li>
 *   <li>A {@code CountDownLatch(2)} forces both threads to arrive at a shared
 *       rendezvous point <em>before</em> either reads its value. This maximises
 *       the chance of interleaving during the set phase.</li>
 *   <li>After the latch opens, each thread reads {@link TenantContext#get()} and
 *       stores the result in an {@link AtomicReference} visible to the main thread.</li>
 *   <li>Each thread calls {@link TenantContext#clear()} in its {@code finally} block.</li>
 *   <li>The main thread joins both threads and asserts the captured values.</li>
 * </ol>
 *
 * <p>Two {@link CountDownLatch} instances are used:
 * <ul>
 *   <li>{@code readyLatch(2)}: each thread counts down after calling {@code set()},
 *       and both await the other before calling {@code get()}. This maximises
 *       interleaving during the set phase.</li>
 *   <li>{@code startLatch(1)}: released by the main thread once both workers are
 *       alive, to start both workers simultaneously from their wait point.</li>
 * </ul>
 *
 * <p>Tag: {@code Feature: sprint-21-mssp-schema, Property 4}
 *
 * <p>Minimum iterations: 100 (configured via {@code @Property(tries = 100)}).
 */
class TenantContextIsolationPropertyTest {

    // =========================================================================
    // Property 4: TenantContext thread isolation
    // =========================================================================

    /**
     * <strong>Validates: Requirements 6.9</strong>
     *
     * <p>For any pair of distinct prefix strings {@code (p1, p2)}, two concurrently
     * running threads that each call {@link TenantContext#set(String)} with their
     * own prefix, then {@link TenantContext#get()}, must each observe only their
     * own value — never the other thread's value.
     *
     * <p>Thread safety via {@code ThreadLocal}: the {@code HOLDER} inside
     * {@link TenantContext} is a {@code ThreadLocal<String>}, so each thread owns
     * an independent slot. This property verifies that isolation holds in practice
     * under concurrent execution.
     */
    @Property(tries = 100)
    void property4_tenantContextThreadIsolation(
            @ForAll("distinctPrefixPairs") String[] prefixPair) throws InterruptedException {

        final String p1 = prefixPair[0];
        final String p2 = prefixPair[1];

        // Captured values — written by worker threads, read by the main thread.
        final AtomicReference<String> t1Observed = new AtomicReference<>();
        final AtomicReference<String> t2Observed = new AtomicReference<>();

        // Captured exceptions — any Throwable thrown inside a worker is surfaced here.
        final AtomicReference<Throwable> t1Error  = new AtomicReference<>();
        final AtomicReference<Throwable> t2Error  = new AtomicReference<>();

        // readyLatch: both workers count down after set(); each then awaits until
        // the other has also called set(), maximising interleaving in the set phase.
        final CountDownLatch readyLatch = new CountDownLatch(2);

        Thread t1 = new Thread(() -> {
            try {
                TenantContext.set(p1);
                readyLatch.countDown();      // signal: T1 has called set()
                readyLatch.await();          // wait until T2 has also called set()
                t1Observed.set(TenantContext.get());
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                t1Error.set(e);
            } catch (Throwable t) {
                t1Error.set(t);
            } finally {
                TenantContext.clear();
            }
        }, "T1-isolation-test");

        Thread t2 = new Thread(() -> {
            try {
                TenantContext.set(p2);
                readyLatch.countDown();      // signal: T2 has called set()
                readyLatch.await();          // wait until T1 has also called set()
                t2Observed.set(TenantContext.get());
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                t2Error.set(e);
            } catch (Throwable t) {
                t2Error.set(t);
            } finally {
                TenantContext.clear();
            }
        }, "T2-isolation-test");

        t1.start();
        t2.start();

        // Join with a generous timeout to avoid hanging the test suite.
        t1.join(5_000);
        t2.join(5_000);

        // Surface any exceptions thrown inside the worker threads.
        if (t1Error.get() != null) {
            fail("T1 threw an unexpected exception: " + t1Error.get().getMessage(),
                    t1Error.get());
        }
        if (t2Error.get() != null) {
            fail("T2 threw an unexpected exception: " + t2Error.get().getMessage(),
                    t2Error.get());
        }

        // Verify threads completed within the timeout.
        assertThat(t1.isAlive())
                .as("T1 should have completed within 5 seconds for prefixes p1='%s', p2='%s'",
                        p1, p2)
                .isFalse();
        assertThat(t2.isAlive())
                .as("T2 should have completed within 5 seconds for prefixes p1='%s', p2='%s'",
                        p1, p2)
                .isFalse();

        // Core isolation assertion: each thread must observe only its own prefix.
        assertThat(t1Observed.get())
                .as("T1 must observe only its own prefix p1='%s' (not T2's p2='%s')", p1, p2)
                .isEqualTo(p1);

        assertThat(t2Observed.get())
                .as("T2 must observe only its own prefix p2='%s' (not T1's p1='%s')", p2, p1)
                .isEqualTo(p2);
    }

    // =========================================================================
    // Arbitrary: pairs of distinct prefix strings
    // =========================================================================

    /**
     * Produces arrays of exactly two distinct, non-null, non-blank prefix strings.
     *
     * <p>Strings are drawn from a generous character pool (printable ASCII) and
     * filtered to guarantee {@code p1.equals(p2) == false}. The filter rejection
     * rate for random strings of length ≥ 2 is negligible.
     *
     * <p>Using {@link Combinators#combine} on two independent {@code String}
     * arbitraries and filtering on inequality is the idiomatic jqwik approach
     * for generating constrained pairs.
     */
    @Provide
    Arbitrary<String[]> distinctPrefixPairs() {
        // Use a broad printable-ASCII pool so the generator exercises diverse inputs.
        // Length 1–30 gives both very short and moderately long prefixes.
        Arbitrary<String> prefixArb = Arbitraries.strings()
                .withCharRange(' ', '~')   // printable ASCII: space (32) to tilde (126)
                .ofMinLength(1)
                .ofMaxLength(30)
                .filter(s -> !s.isBlank()); // exclude blank / whitespace-only strings

        return Combinators.combine(prefixArb, prefixArb)
                .as((a, b) -> new String[]{a, b})
                .filter(pair -> !pair[0].equals(pair[1])); // guarantee distinctness
    }
}
