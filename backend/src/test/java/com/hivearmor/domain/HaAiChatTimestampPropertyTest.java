package com.hivearmor.domain;

import net.jqwik.api.*;
import org.junit.jupiter.api.Test;

import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Property 9: Entity timestamp lifecycle.
 *
 * <p><strong>Property 9: Entity timestamp lifecycle</strong><br>
 * On first persist, {@code createdAt == updatedAt} within a small tolerance of persist time;
 * on any subsequent update, {@code updatedAt >= previous updatedAt} and {@code createdAt}
 * is never modified.
 *
 * <p>These tests exercise the {@code @PrePersist} and {@code @PreUpdate} callbacks
 * directly without requiring a database. The Testcontainers variant is separated
 * into an integration test tagged {@code integration}.
 *
 * <p><strong>Validates: Requirements 2.3, 2.4</strong>
 */
@Label("Feature: sprint-25-ai-chat, Property 9: Entity timestamp lifecycle")
class HaAiChatTimestampPropertyTest {

    // =========================================================================
    // Property 9-A: @PrePersist sets createdAt == updatedAt
    // =========================================================================

    /**
     * Simulating {@code @PrePersist}: calling {@code onCreate()} should set both
     * {@code createdAt} and {@code updatedAt} to the same instant.
     */
    @Property(tries = 100)
    @Label("Property 9-A: @PrePersist sets createdAt == updatedAt")
    void property9a_prePersist_createdAtEqualsUpdatedAt() {
        HaAiChatHistory entity = new HaAiChatHistory();

        Instant before = Instant.now();
        // Simulate JPA @PrePersist by calling the method directly
        callOnCreate(entity);
        Instant after = Instant.now();

        assertThat(entity.getCreatedAt())
            .as("createdAt must be set by @PrePersist")
            .isNotNull()
            .isAfterOrEqualTo(before)
            .isBeforeOrEqualTo(after);

        assertThat(entity.getUpdatedAt())
            .as("updatedAt must be set by @PrePersist")
            .isNotNull()
            .isAfterOrEqualTo(before)
            .isBeforeOrEqualTo(after);

        assertThat(entity.getCreatedAt())
            .as("createdAt must equal updatedAt immediately after @PrePersist")
            .isEqualTo(entity.getUpdatedAt());
    }

    // =========================================================================
    // Property 9-B: @PreUpdate advances updatedAt, createdAt unchanged
    // =========================================================================

    /**
     * After a persist followed by an update, {@code updatedAt >= createdAt} and
     * {@code createdAt} is never modified.
     */
    @Property(tries = 100)
    @Label("Property 9-B: @PreUpdate advances updatedAt without modifying createdAt")
    void property9b_preUpdate_advancesUpdatedAt_createdAtUnchanged() throws InterruptedException {
        HaAiChatHistory entity = new HaAiChatHistory();

        callOnCreate(entity);
        Instant originalCreatedAt = entity.getCreatedAt();
        Instant originalUpdatedAt = entity.getUpdatedAt();

        // Small sleep to ensure the clock advances
        Thread.sleep(2);

        callOnUpdate(entity);

        assertThat(entity.getCreatedAt())
            .as("createdAt must NOT change after @PreUpdate")
            .isEqualTo(originalCreatedAt);

        assertThat(entity.getUpdatedAt())
            .as("updatedAt must be >= original updatedAt after @PreUpdate")
            .isAfterOrEqualTo(originalUpdatedAt);
    }

    // =========================================================================
    // Property 9-C: multiple updates — createdAt always stays at original value
    // =========================================================================

    /**
     * For any sequence of N updates, {@code createdAt} is always equal to the value
     * set during {@code @PrePersist}.
     */
    @Property(tries = 50)
    @Label("Property 9-C: createdAt never changes across multiple updates")
    void property9c_multipleUpdates_createdAtNeverChanges(
            @ForAll @net.jqwik.api.constraints.IntRange(min = 1, max = 10) int updateCount)
            throws InterruptedException {

        HaAiChatHistory entity = new HaAiChatHistory();
        callOnCreate(entity);
        Instant originalCreatedAt = entity.getCreatedAt();

        for (int i = 0; i < updateCount; i++) {
            Thread.sleep(1);
            callOnUpdate(entity);
            assertThat(entity.getCreatedAt())
                .as("createdAt must not change on update #%d", i + 1)
                .isEqualTo(originalCreatedAt);
        }
    }

    // =========================================================================
    // Property 9-D: updatedAt is monotonically non-decreasing across updates
    // =========================================================================

    @Property(tries = 30)
    @Label("Property 9-D: updatedAt is monotonically non-decreasing")
    void property9d_updatedAt_monotonicallyNonDecreasing(
            @ForAll @net.jqwik.api.constraints.IntRange(min = 2, max = 8) int updateCount)
            throws InterruptedException {

        HaAiChatHistory entity = new HaAiChatHistory();
        callOnCreate(entity);

        Instant previous = entity.getUpdatedAt();
        for (int i = 0; i < updateCount; i++) {
            Thread.sleep(1);
            callOnUpdate(entity);
            assertThat(entity.getUpdatedAt())
                .as("updatedAt must be >= previous updatedAt on update #%d", i + 1)
                .isAfterOrEqualTo(previous);
            previous = entity.getUpdatedAt();
        }
    }

    // =========================================================================
    // Helpers — invoke lifecycle callbacks via reflection to avoid needing an EM
    // =========================================================================

    private static void callOnCreate(HaAiChatHistory entity) {
        try {
            var method = HaAiChatHistory.class.getDeclaredMethod("onCreate");
            method.setAccessible(true);
            method.invoke(entity);
        } catch (Exception e) {
            throw new RuntimeException("Failed to invoke @PrePersist onCreate", e);
        }
    }

    private static void callOnUpdate(HaAiChatHistory entity) {
        try {
            var method = HaAiChatHistory.class.getDeclaredMethod("onUpdate");
            method.setAccessible(true);
            method.invoke(entity);
        } catch (Exception e) {
            throw new RuntimeException("Failed to invoke @PreUpdate onUpdate", e);
        }
    }
}
