package com.hivearmor.service.ueba;

import net.jqwik.api.*;

import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Property-based test for the tier rubric top-wins semantics in {@link HaUebaDeviationEngine}.
 *
 * <p><strong>Property 4: Highest applicable tier wins, no stacking</strong><br>
 * For every metric observation with a computable z-score {@code z}, {@code awardPoints(z)}
 * returns 50 iff {@code |z| > 4}, 25 iff {@code 3 < |z| ≤ 4}, 10 iff {@code 2 < |z| ≤ 3},
 * and 0 iff {@code |z| ≤ 2}; no input produces 35, 60, 75, or 85 (ensures no stacking).
 *
 * <p><strong>Validates: Requirements 3.3, 3.4, 3.5</strong>
 *
 * <h2>Test strategy</h2>
 * <ul>
 *   <li>Generate random doubles across all tier ranges including boundaries.</li>
 *   <li>Call the static {@code HaUebaDeviationEngine.awardPoints(z)} method directly.</li>
 *   <li>Verify the correct tier is awarded and no stacking occurs.</li>
 * </ul>
 */
class HaUebaDeviationEngineTierRubricPropertyTest {

    /** Point values that would indicate tier stacking — must never appear. */
    private static final Set<Integer> STACKED_VALUES = Set.of(35, 60, 75, 85);

    /** The only valid point values the rubric may produce. */
    private static final Set<Integer> VALID_VALUES = Set.of(0, 10, 25, 50);

    // =========================================================================
    // Property 4: Highest applicable tier wins, no stacking
    // Validates: Requirements 3.3, 3.4, 3.5
    // =========================================================================

    /**
     * <strong>Validates: Requirements 3.3, 3.4, 3.5</strong>
     *
     * <p>For z-scores where {@code |z| > 4}, {@code awardPoints} must return exactly 50.
     */
    @Property(tries = 500)
    @Label("Property 4a: |z| > 4 → always 50 points (critical tier)")
    void property4a_absoluteZGreaterThan4_returns50(
            @ForAll("zScoresAbove4") double z) {

        int points = HaUebaDeviationEngine.awardPoints(z);

        assertThat(points)
            .as("awardPoints(%f) where |z| > 4 must return 50", z)
            .isEqualTo(50);
        assertThat(STACKED_VALUES)
            .as("No stacking: %d must not be a stacked value", points)
            .doesNotContain(points);
    }

    /**
     * <strong>Validates: Requirements 3.3, 3.4, 3.5</strong>
     *
     * <p>For z-scores where {@code 3 < |z| ≤ 4}, {@code awardPoints} must return exactly 25.
     */
    @Property(tries = 500)
    @Label("Property 4b: 3 < |z| ≤ 4 → always 25 points (high tier)")
    void property4b_absoluteZBetween3And4_returns25(
            @ForAll("zScoresBetween3And4") double z) {

        int points = HaUebaDeviationEngine.awardPoints(z);

        assertThat(points)
            .as("awardPoints(%f) where 3 < |z| ≤ 4 must return 25", z)
            .isEqualTo(25);
        assertThat(STACKED_VALUES)
            .as("No stacking: %d must not be a stacked value", points)
            .doesNotContain(points);
    }

    /**
     * <strong>Validates: Requirements 3.3, 3.4, 3.5</strong>
     *
     * <p>For z-scores where {@code 2 < |z| ≤ 3}, {@code awardPoints} must return exactly 10.
     */
    @Property(tries = 500)
    @Label("Property 4c: 2 < |z| ≤ 3 → always 10 points (medium tier)")
    void property4c_absoluteZBetween2And3_returns10(
            @ForAll("zScoresBetween2And3") double z) {

        int points = HaUebaDeviationEngine.awardPoints(z);

        assertThat(points)
            .as("awardPoints(%f) where 2 < |z| ≤ 3 must return 10", z)
            .isEqualTo(10);
        assertThat(STACKED_VALUES)
            .as("No stacking: %d must not be a stacked value", points)
            .doesNotContain(points);
    }

    /**
     * <strong>Validates: Requirements 3.3, 3.4, 3.5</strong>
     *
     * <p>For z-scores where {@code |z| ≤ 2}, {@code awardPoints} must return exactly 0.
     */
    @Property(tries = 500)
    @Label("Property 4d: |z| ≤ 2 → always 0 points (no anomaly)")
    void property4d_absoluteZLessThanOrEqual2_returns0(
            @ForAll("zScoresAtOrBelow2") double z) {

        int points = HaUebaDeviationEngine.awardPoints(z);

        assertThat(points)
            .as("awardPoints(%f) where |z| ≤ 2 must return 0", z)
            .isEqualTo(0);
        assertThat(STACKED_VALUES)
            .as("No stacking: %d must not be a stacked value", points)
            .doesNotContain(points);
    }

    /**
     * <strong>Validates: Requirements 3.3, 3.4, 3.5</strong>
     *
     * <p>For any arbitrary z-score, the result is never a stacked value (35, 60, 75, 85)
     * and is always one of the valid tier values (0, 10, 25, 50).
     */
    @Property(tries = 1000)
    @Label("Property 4e: No input ever produces a stacked value (35, 60, 75, 85)")
    void property4e_noStackingAcrossAllInputs(
            @ForAll("anyZScore") double z) {

        int points = HaUebaDeviationEngine.awardPoints(z);

        assertThat(VALID_VALUES)
            .as("awardPoints(%f) must return one of {0, 10, 25, 50}, got %d", z, points)
            .contains(points);
        assertThat(STACKED_VALUES)
            .as("awardPoints(%f) must never produce a stacked value, got %d", z, points)
            .doesNotContain(points);
    }

    // =========================================================================
    // Arbitraries — generate z-scores covering all ranges and boundaries
    // =========================================================================

    /**
     * Generates z-scores where |z| > 4 — both positive and negative.
     * Includes values just above 4 (boundary) and large values.
     */
    @Provide
    Arbitrary<Double> zScoresAbove4() {
        Arbitrary<Double> positiveAbove4 = Arbitraries.doubles()
            .between(4.01, 100.0)
            .ofScale(4);

        Arbitrary<Double> negativeAbove4 = positiveAbove4.map(v -> -v);

        return Arbitraries.oneOf(positiveAbove4, negativeAbove4);
    }

    /**
     * Generates z-scores where 3 < |z| ≤ 4 — both positive and negative.
     * Includes the boundary value 4.0 (exactly) and values just above 3.
     */
    @Provide
    Arbitrary<Double> zScoresBetween3And4() {
        Arbitrary<Double> positiveBetween3And4 = Arbitraries.doubles()
            .between(3.01, 4.0)
            .ofScale(4);

        Arbitrary<Double> negativeBetween3And4 = positiveBetween3And4.map(v -> -v);

        return Arbitraries.oneOf(positiveBetween3And4, negativeBetween3And4);
    }

    /**
     * Generates z-scores where 2 < |z| ≤ 3 — both positive and negative.
     * Includes the boundary value 3.0 (exactly) and values just above 2.
     */
    @Provide
    Arbitrary<Double> zScoresBetween2And3() {
        Arbitrary<Double> positiveBetween2And3 = Arbitraries.doubles()
            .between(2.01, 3.0)
            .ofScale(4);

        Arbitrary<Double> negativeBetween2And3 = positiveBetween2And3.map(v -> -v);

        return Arbitraries.oneOf(positiveBetween2And3, negativeBetween2And3);
    }

    /**
     * Generates z-scores where |z| ≤ 2 — both positive and negative, and zero.
     * Includes the boundary value 2.0 (exactly), zero, and negative values.
     */
    @Provide
    Arbitrary<Double> zScoresAtOrBelow2() {
        return Arbitraries.doubles()
            .between(-2.0, 2.0)
            .ofScale(4);
    }

    /**
     * Generates z-scores across the entire double range to ensure no input
     * ever produces stacking. Covers all four tiers plus extreme values.
     */
    @Provide
    Arbitrary<Double> anyZScore() {
        return Arbitraries.doubles()
            .between(-1000.0, 1000.0)
            .ofScale(4);
    }
}
