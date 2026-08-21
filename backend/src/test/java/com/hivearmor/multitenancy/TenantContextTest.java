package com.hivearmor.multitenancy;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Example unit tests for {@link TenantContext}.
 *
 * <p>Tests are plain JUnit 5 — no Spring context required.
 *
 * <p>Satisfies Requirements: 6.8, 6.9
 */
class TenantContextTest {

    @AfterEach
    void cleanup() {
        TenantContext.clear();
    }

    // -------------------------------------------------------------------------
    // Test 1: single-thread try/finally cleanup
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("TenantContext.clear() in finally leaves get()==null and isMssp()==false")
    void clearInFinallyRemovesTenantContext() {
        TenantContext.set("acme");

        try {
            // Simulate an exception being thrown inside the try block.
            if (true) {
                throw new RuntimeException("simulated error");
            }
        } catch (RuntimeException ignored) {
            // exception is caught and discarded — clear() must still run
        } finally {
            TenantContext.clear();
        }

        assertThat(TenantContext.get())
                .as("get() must return null after clear()")
                .isNull();
        assertThat(TenantContext.isMssp())
                .as("isMssp() must return false after clear()")
                .isFalse();
    }

    // -------------------------------------------------------------------------
    // Test 2: two-thread isolation via CountDownLatch
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("ThreadLocal isolation: each thread observes only its own prefix")
    void threadLocalIsolation() throws InterruptedException {
        // Latch 1: both threads have called TenantContext.set() before either reads
        CountDownLatch bothSet = new CountDownLatch(2);
        // Latch 2: both threads have read their value before either finishes
        CountDownLatch bothRead = new CountDownLatch(2);

        AtomicReference<String> valueSeenByA = new AtomicReference<>();
        AtomicReference<String> valueSeenByB = new AtomicReference<>();
        AtomicReference<Throwable> threadError = new AtomicReference<>();

        Thread threadA = new Thread(() -> {
            try {
                TenantContext.set("acme");
                bothSet.countDown();         // signal: A has set its value
                bothSet.await();             // wait for B to set its value too
                valueSeenByA.set(TenantContext.get());
                bothRead.countDown();
                bothRead.await();
            } catch (Throwable t) {
                threadError.set(t);
            } finally {
                TenantContext.clear();
            }
        }, "thread-A");

        Thread threadB = new Thread(() -> {
            try {
                TenantContext.set("bravo");
                bothSet.countDown();         // signal: B has set its value
                bothSet.await();             // wait for A to set its value too
                valueSeenByB.set(TenantContext.get());
                bothRead.countDown();
                bothRead.await();
            } catch (Throwable t) {
                threadError.set(t);
            } finally {
                TenantContext.clear();
            }
        }, "thread-B");

        threadA.start();
        threadB.start();
        threadA.join();
        threadB.join();

        // Propagate any thread-internal exception to fail the test clearly
        if (threadError.get() != null) {
            throw new AssertionError("Thread threw an unexpected exception", threadError.get());
        }

        assertThat(valueSeenByA.get())
                .as("Thread A must observe only its own prefix 'acme'")
                .isEqualTo("acme");
        assertThat(valueSeenByB.get())
                .as("Thread B must observe only its own prefix 'bravo'")
                .isEqualTo("bravo");
    }
}
